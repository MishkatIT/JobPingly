import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/lib/db/client';
import { emailVerifications, users } from '@/lib/db/schema';
import { requestPasswordReset } from '@/lib/auth/accounts';
import * as register from '@/app/api/auth/register/route';
import * as verify from '@/app/api/auth/verify/route';
import * as login from '@/app/api/auth/login/route';
import * as logout from '@/app/api/auth/logout/route';
import * as resetPassword from '@/app/api/auth/reset-password/route';
import * as me from '@/app/api/me/route';
import * as changePassword from '@/app/api/me/password/route';
import { call, createUser, lastEmailTo, resetData, sessionCookieFrom } from '../helpers/integration';

const codeFrom = (text = '') => /\b(\d{6})\b/.exec(text)?.[1] ?? '';

before(resetData);
after(() => closeDb());

describe('Sign-up and verification', () => {
  test('register, receive a code, verify, and get a working session', async () => {
    const email = 'new.person@example.com';
    const registered = await call<{ ticket: string }>(register.POST, { body: { name: 'New Person', email, password: 'a sensible passphrase', timezone: 'Asia/Dhaka' } });
    assert.equal(registered.status, 200);
    const ticket = registered.body.data!.ticket;

    const mail = lastEmailTo(email);
    assert.ok(mail, 'a verification email was sent');
    assert.ok(!/\d{6}/.test(mail!.subject), 'the code is not in the stored subject');
    const code = codeFrom(mail!.text);
    assert.match(code, /^\d{6}$/);

    const verified = await call<{ redirectTo: string }>(verify.POST, { body: { ticket, code } });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data!.redirectTo, '/onboarding');
    const cookie = sessionCookieFrom(verified.headers);
    assert.ok(cookie);

    const profile = await call<{ user: { email: string; name: string } }>(me.GET, { cookie: cookie! });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data!.user.email, email);
    assert.equal(profile.body.data!.user.name, 'New Person');
    assert.ok(!JSON.stringify(profile.body).includes('$2'), 'no password hash in the response');
  });

  test('a wrong code is rejected and attempts are limited', async () => {
    const email = 'typo@example.com';
    const { body } = await call<{ ticket: string }>(register.POST, { body: { name: 'Typo', email, password: 'another fine passphrase' } });
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await call(verify.POST, { body: { ticket: body.data!.ticket, code: '000000' } });
      assert.equal(result.status, 400);
    }
    const fifth = await call(verify.POST, { body: { ticket: body.data!.ticket, code: '000000' } });
    assert.equal(fifth.body.error?.code, 'too_many_attempts');
    const correct = await call(verify.POST, { body: { ticket: body.data!.ticket, code: codeFrom(lastEmailTo(email)?.text) } });
    assert.equal(correct.status, 400, 'even the right code is refused after too many attempts');
  });

  test('regression: knowing a verified email is not enough to get a session', async () => {
    const victim = await createUser({ email: 'admin.victim@example.com' });
    const result = await call(verify.POST, { body: { ticket: 'a'.repeat(64), code: '123456' } });
    assert.equal(result.status, 400);
    assert.equal(sessionCookieFrom(result.headers), null);
    assert.ok(victim.id);
  });

  test('someone who registers your address cannot set your password', async () => {
    const email = 'target@example.com';
    const attacker = await call<{ ticket: string }>(register.POST, { body: { name: 'Mallory', email, password: 'attacker chosen password' } });
    // Let the resend cooldown pass, as if the real owner signs up a few minutes later.
    await db.update(emailVerifications).set({ lastSentAt: new Date(Date.now() - 5 * 60_000) });
    const owner = await call<{ ticket: string }>(register.POST, { body: { name: 'Real Owner', email, password: 'the owners own password' } });
    assert.equal(owner.status, 200);

    const ownerCode = codeFrom(lastEmailTo(email)?.text);
    // The attacker cannot use the owner's code with their own ticket.
    const hijack = await call(verify.POST, { body: { ticket: attacker.body.data!.ticket, code: ownerCode } });
    assert.equal(hijack.status, 400);

    const verified = await call(verify.POST, { body: { ticket: owner.body.data!.ticket, code: ownerCode } });
    assert.equal(verified.status, 200);

    assert.equal((await call(login.POST, { body: { email, password: 'attacker chosen password' } })).status, 401);
    assert.equal((await call(login.POST, { body: { email, password: 'the owners own password' } })).status, 200);
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.email, email));
    assert.equal(row.name, 'Real Owner');
  });

  test('signing up with a registered address reveals nothing and notifies the owner', async () => {
    const existing = await createUser({ email: 'already@example.com' });
    const result = await call<{ ticket: string }>(register.POST, { body: { name: 'X', email: existing.email, password: 'some new passphrase' } });
    assert.equal(result.status, 200);
    assert.match(result.body.data!.ticket, /^[a-f0-9]{64}$/);
    assert.match(lastEmailTo(existing.email)?.subject ?? '', /tried to create/);
  });
});

describe('Sign-in', () => {
  test('wrong password and unknown address get the same answer', async () => {
    const user = await createUser({ email: 'signin@example.com' });
    const wrong = await call(login.POST, { body: { email: user.email, password: 'not the password' } });
    const unknown = await call(login.POST, { body: { email: 'nobody@example.com', password: 'whatever it is' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error?.message, unknown.body.error?.message);
  });

  test('suspended accounts cannot sign in', async () => {
    const user = await createUser({ email: 'suspended@example.com' });
    await db.update(users).set({ isBlocked: true }).where(eq(users.id, user.id));
    const result = await call(login.POST, { body: { email: user.email, password: user.password } });
    assert.equal(result.status, 403);
    assert.equal(result.body.error?.code, 'account_suspended');
    // An existing session stops working too.
    assert.equal((await call(me.GET, { cookie: user.cookie })).status, 401);
  });

  test('an unfinished sign-up resumes from the login form', async () => {
    const email = 'halfway@example.com';
    await call(register.POST, { body: { name: 'Halfway', email, password: 'halfway done password' } });
    const result = await call<{ status: string; ticket: string }>(login.POST, { body: { email, password: 'halfway done password' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.data!.status, 'verification_required');
    const verified = await call(verify.POST, { body: { ticket: result.body.data!.ticket, code: codeFrom(lastEmailTo(email)?.text) } });
    assert.equal(verified.status, 200);
  });

  test('signing out revokes the session immediately', async () => {
    const user = await createUser();
    assert.equal((await call(me.GET, { cookie: user.cookie })).status, 200);
    await call(logout.POST, { cookie: user.cookie, body: {} });
    assert.equal((await call(me.GET, { cookie: user.cookie })).status, 401);
  });

  test('repeated failures for one address are rate limited', async () => {
    const user = await createUser({ email: 'bruteforce@example.com' });
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt++) {
      last = (await call(login.POST, { body: { email: user.email, password: `guess ${attempt} guess` } })).status;
    }
    assert.equal(last, 429);
  });
});

describe('Passwords', () => {
  test('reset by email signs out every other session', async () => {
    const user = await createUser({ email: 'forgetful@example.com' });
    await requestPasswordReset(user.email);
    const link = /reset-password\?token=([a-f0-9]{64})/.exec(lastEmailTo(user.email)?.text ?? '')?.[1];
    assert.ok(link, 'reset link sent');

    const reset = await call(resetPassword.POST, { body: { token: link, password: 'a brand new passphrase' } });
    assert.equal(reset.status, 200);
    assert.ok(sessionCookieFrom(reset.headers));
    assert.equal((await call(me.GET, { cookie: user.cookie })).status, 401, 'old session revoked');
    assert.equal((await call(resetPassword.POST, { body: { token: link, password: 'yet another passphrase' } })).status, 400, 'link is single-use');
    assert.equal((await call(login.POST, { body: { email: user.email, password: 'a brand new passphrase' } })).status, 200);
  });

  test('changing the password requires the current one', async () => {
    const user = await createUser();
    const wrong = await call(changePassword.POST, { cookie: user.cookie, body: { currentPassword: 'nope nope nope', newPassword: 'another good phrase' } });
    assert.equal(wrong.status, 400);
    const ok = await call(changePassword.POST, { cookie: user.cookie, body: { currentPassword: user.password, newPassword: 'another good phrase' } });
    assert.equal(ok.status, 200);
    assert.equal((await call(me.GET, { cookie: user.cookie })).status, 200, 'the current session is kept');
  });
});
