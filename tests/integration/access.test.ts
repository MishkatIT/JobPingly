import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/lib/db/client';
import { jobs, notificationQueue, users } from '@/lib/db/schema';
import { proxy } from '@/proxy';
import * as listsRoute from '@/app/api/lists/route';
import * as listRoute from '@/app/api/lists/[id]/route';
import * as companiesRoute from '@/app/api/lists/[id]/companies/route';
import * as followRoute from '@/app/api/lists/[id]/follow/route';
import * as membersRoute from '@/app/api/lists/[id]/members/route';
import * as invitationRoute from '@/app/api/invitations/[id]/route';
import * as invitationsRoute from '@/app/api/me/invitations/route';
import * as jobsRoute from '@/app/api/jobs/route';
import * as jobRoute from '@/app/api/jobs/[id]/route';
import * as publicLists from '@/app/api/public/lists/route';
import * as adminOverview from '@/app/api/admin/overview/route';
import * as adminSources from '@/app/api/admin/sources/route';
import * as adminSettings from '@/app/api/admin/settings/route';
import * as adminUser from '@/app/api/admin/users/[id]/route';
import { BASE_URL, call, createSource, createUser, resetData, setSettings } from '../helpers/integration';

before(resetData);
after(() => closeDb());

describe('Watchlist privacy', () => {
  test('a private list is invisible to everyone else', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Secret targets' } });
    assert.equal(created.status, 201);
    const params = { id: created.body.data!.id };

    assert.equal((await call(listRoute.GET, { params })).status, 404, 'anonymous');
    assert.equal((await call(listRoute.GET, { cookie: stranger.cookie, params })).status, 404, 'other user');
    assert.equal((await call(listRoute.PATCH, { cookie: stranger.cookie, params, method: 'PATCH', body: { name: 'Mine now' } })).status, 404);
    assert.equal((await call(listRoute.DELETE, { cookie: stranger.cookie, params, method: 'DELETE' })).status, 404);
    assert.equal((await call(companiesRoute.POST, { cookie: stranger.cookie, params, body: { url: 'https://boards.greenhouse.io/acme' } })).status, 404);
    assert.equal((await call(companiesRoute.GET, { cookie: stranger.cookie, params })).status, 404);
    assert.equal((await call(listRoute.GET, { cookie: owner.cookie, params })).status, 200);
  });

  test('a public list can be read and followed but not edited by others', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Open list', visibility: 'public' } });
    const params = { id: created.body.data!.id };

    assert.equal((await call(listRoute.GET, { params })).status, 200);
    assert.equal((await call(listRoute.PATCH, { cookie: fan.cookie, params, method: 'PATCH', body: { name: 'Hijacked' } })).status, 403);
    assert.equal((await call(companiesRoute.POST, { cookie: fan.cookie, params, body: { url: 'https://boards.greenhouse.io/acme' } })).status, 403);
    const followed = await call<{ following: boolean; followers: number }>(followRoute.POST, { cookie: fan.cookie, params, body: {} });
    assert.equal(followed.status, 200);
    assert.equal(followed.body.data!.followers, 1, 'the owner is not counted as a follower');
  });

  test('followers lose access to jobs when a list is made private', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const source = await createSource('https://boards.greenhouse.io/privacy-co');
    await db.insert(jobs).values({ careerPageId: source.id, fingerprint: 'ext:p1', title: 'Platform Engineer', status: 'active' });

    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Will go private', visibility: 'public' } });
    const params = { id: created.body.data!.id };
    const { listCareerPages } = await import('@/lib/db/schema');
    await db.insert(listCareerPages).values({ listId: params.id, careerPageId: source.id });
    await call(followRoute.POST, { cookie: fan.cookie, params, body: {} });

    const before = await call<unknown[]>(jobsRoute.GET, { cookie: fan.cookie, url: '/api/jobs?view=all' });
    assert.equal(before.body.data!.length, 1);

    await call(listRoute.PATCH, { cookie: owner.cookie, params, method: 'PATCH', body: { visibility: 'private' } });
    const afterwards = await call<unknown[]>(jobsRoute.GET, { cookie: fan.cookie, url: '/api/jobs?view=all' });
    assert.equal(afterwards.body.data!.length, 0);

    const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.careerPageId, source.id));
    assert.equal((await call(jobRoute.GET, { cookie: fan.cookie, params: { id: job.id } })).status, 404);

    // Unfollowing still works so the follower is not stuck.
    assert.equal((await call(followRoute.DELETE, { cookie: fan.cookie, params, method: 'DELETE' })).status, 200);
  });

  test('public lists close to non-followers when public lists are off or the owner is suspended', async () => {
    const owner = await createUser();
    const fan = await createUser();
    const stranger = await createUser();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Gated', visibility: 'public' } });
    const params = { id: created.body.data!.id };
    await call(followRoute.POST, { cookie: fan.cookie, params, body: {} });

    await setSettings({ 'public_lists.enabled': false });
    try {
      assert.equal((await call(listRoute.GET, { params })).status, 404, 'anonymous, directory off');
      assert.equal((await call(listRoute.GET, { cookie: stranger.cookie, params })).status, 404, 'stranger, directory off');
      assert.equal((await call(listRoute.GET, { cookie: fan.cookie, params })).status, 200, 'a follower can still manage their alerts');
    } finally {
      await setSettings({ 'public_lists.enabled': true });
    }

    await db.update(users).set({ isBlocked: true }).where(eq(users.id, owner.id));
    assert.equal((await call(listRoute.GET, { cookie: stranger.cookie, params })).status, 404, 'owner suspended');
    assert.equal((await call(listRoute.GET, { cookie: fan.cookie, params })).status, 200, 'follower keeps access');
  });

  test('private lists never appear in the public directory', async () => {
    const owner = await createUser();
    const source = await createSource('https://boards.greenhouse.io/dir-co');
    const { listCareerPages } = await import('@/lib/db/schema');
    for (const visibility of ['public', 'private'] as const) {
      const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: `Directory ${visibility}`, visibility } });
      await db.insert(listCareerPages).values({ listId: created.body.data!.id, careerPageId: source.id });
    }
    const directory = await call<{ name: string }[]>(publicLists.GET, { url: '/api/public/lists?q=Directory' });
    assert.deepEqual(directory.body.data!.map(list => list.name), ['Directory public']);
  });
});

describe('Collaboration', () => {
  test('an editor can manage companies but cannot delete the list', async () => {
    const owner = await createUser();
    const editor = await createUser();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Team list' } });
    const params = { id: created.body.data!.id };

    const invited = await call(membersRoute.POST, { cookie: owner.cookie, params, body: { email: editor.email, role: 'editor' } });
    assert.equal(invited.status, 200);
    const invitations = await call<{ id: string }[]>(invitationsRoute.GET, { cookie: editor.cookie });
    assert.equal(invitations.body.data!.length, 1);
    const accepted = await call(invitationRoute.POST, { cookie: editor.cookie, params: { id: invitations.body.data![0].id }, body: { action: 'accept' } });
    assert.equal(accepted.status, 200);

    const add = await call(companiesRoute.POST, { cookie: editor.cookie, params, body: { url: 'https://boards.greenhouse.io/teamco', companyName: 'TeamCo' } });
    assert.equal(add.status, 201);
    assert.equal((await call(listRoute.DELETE, { cookie: editor.cookie, params, method: 'DELETE' })).status, 403);
    assert.equal((await call(listRoute.PATCH, { cookie: editor.cookie, params, method: 'PATCH', body: { visibility: 'public' } })).status, 403);
  });

  test('inviting an unknown address looks the same as inviting a member', async () => {
    const owner = await createUser();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Quiet' } });
    const result = await call<{ sent: boolean }>(membersRoute.POST, { cookie: owner.cookie, params: { id: created.body.data!.id }, body: { email: 'nobody@nowhere.example' } });
    assert.equal(result.status, 200);
    assert.equal(result.body.data!.sent, true);
  });
});

describe('Untrusted URLs', () => {
  test('internal and metadata addresses are refused', async () => {
    const owner = await createUser();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'SSRF attempts' } });
    const params = { id: created.body.data!.id };
    for (const url of ['http://169.254.169.254/latest/meta-data', 'http://localhost:5432', 'https://db.internal-test.example/careers']) {
      const result = await call(companiesRoute.POST, { cookie: owner.cookie, params, body: { url } });
      assert.equal(result.status, 400, url);
    }
  });
});

describe('Admin authorisation is enforced on the server', () => {
  test('anonymous and regular users are refused', async () => {
    const user = await createUser();
    assert.equal((await call(adminOverview.GET)).status, 401);
    assert.equal((await call(adminOverview.GET, { cookie: user.cookie })).status, 403);
  });

  test('support can read but not change', async () => {
    const support = await createUser({ role: 'support' });
    assert.equal((await call(adminOverview.GET, { cookie: support.cookie })).status, 200);
    assert.equal((await call(adminSources.POST, { cookie: support.cookie, body: { url: 'https://boards.greenhouse.io/x' } })).status, 403);
  });

  test('admins cannot flip owner-only switches or change roles', async () => {
    const admin = await createUser({ role: 'admin' });
    const someone = await createUser();
    const sensitive = await call(adminSettings.PUT, { cookie: admin.cookie, method: 'PUT', body: { key: 'auth.signup_enabled', value: false } });
    assert.equal(sensitive.status, 403);
    const ordinary = await call(adminSettings.PUT, { cookie: admin.cookie, method: 'PUT', body: { key: 'limits.max_lists_per_user', value: 12 } });
    assert.equal(ordinary.status, 200);
    const promote = await call(adminUser.POST, { cookie: admin.cookie, params: { id: someone.id }, body: { action: 'set_role', role: 'admin' } });
    assert.equal(promote.status, 403);
  });

  test('a moderator cannot suspend an admin', async () => {
    const moderator = await createUser({ role: 'moderator' });
    const admin = await createUser({ role: 'admin' });
    const result = await call(adminUser.POST, { cookie: moderator.cookie, params: { id: admin.id }, body: { action: 'suspend', reason: 'test' } });
    assert.equal(result.status, 403);
  });

  test('verifying or changing email approval also needs a higher role than the account holder', async () => {
    const support = await createUser({ role: 'support' });
    const admin = await createUser({ role: 'admin', verified: false });
    const regular = await createUser({ verified: false });
    assert.equal((await call(adminUser.POST, { cookie: support.cookie, params: { id: admin.id }, body: { action: 'verify' } })).status, 403);
    assert.equal((await call(adminUser.POST, { cookie: support.cookie, params: { id: regular.id }, body: { action: 'verify' } })).status, 200);
    const owner = await createUser({ role: 'owner' });
    const otherAdmin = await createUser({ role: 'admin' });
    assert.equal((await call(adminUser.POST, { cookie: otherAdmin.cookie, params: { id: owner.id }, body: { action: 'revoke_email' } })).status, 403);
  });

  test("deleting an account cancels followers' pending alerts for its lists", async () => {
    const owner = await createUser();
    const fan = await createUser();
    const admin = await createUser({ role: 'admin' });
    const source = await createSource('https://boards.greenhouse.io/leaving-co');
    const [job] = await db.insert(jobs).values({ careerPageId: source.id, fingerprint: 'ext:leave1', title: 'Engineer', status: 'active' }).returning();
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Going away', visibility: 'public' } });
    const listId = created.body.data!.id;
    await db.insert(notificationQueue).values({ userId: fan.id, jobId: job.id, listId, eventType: 'new' });

    assert.equal((await call(adminUser.DELETE, { cookie: admin.cookie, params: { id: owner.id }, method: 'DELETE' })).status, 200);
    const [row] = await db.select().from(notificationQueue).where(eq(notificationQueue.userId, fan.id));
    assert.ok(row.sentAt, 'settled, so it is never emailed');
    assert.match(row.lastError ?? '', /deleted/);
  });

  test('settings reject values of the wrong type', async () => {
    const owner = await createUser({ role: 'owner' });
    const result = await call(adminSettings.PUT, { cookie: owner.cookie, method: 'PUT', body: { key: 'email.brevo_daily_limit', value: true } });
    assert.equal(result.status, 400);
    const unknown = await call(adminSettings.PUT, { cookie: owner.cookie, method: 'PUT', body: { key: 'made.up', value: 1 } });
    assert.equal(unknown.status, 400);
  });
});

describe('Plans', () => {
  test('a paid plan past its end date gets the free-plan limits everywhere', async () => {
    const { getLimits } = await import('@/lib/plans');
    const paid = await getLimits({ plan: 'pro', planExpiresAt: new Date(Date.now() + 86_400_000) });
    assert.equal(paid.companiesPerList, 250);
    const lapsed = await getLimits({ plan: 'pro', planExpiresAt: new Date(Date.now() - 1000) });
    const free = await getLimits({ plan: 'free' });
    assert.deepEqual(lapsed, free);

    // The watchlist page reads the owner's plan from the database: it must apply the end date too.
    const owner = await createUser({ plan: 'pro' });
    await db.update(users).set({ planExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.id, owner.id));
    const created = await call<{ id: string }>(listsRoute.POST, { cookie: owner.cookie, body: { name: 'Lapsed' } });
    const detail = await call<{ limits: { companiesPerList: number | null } }>(listRoute.GET, { cookie: owner.cookie, params: { id: created.body.data!.id } });
    assert.equal(detail.body.data!.limits.companiesPerList, free.companiesPerList);
  });
});

describe('Cross-site request forgery', () => {
  const request = (origin: string | null, method = 'POST') =>
    new NextRequest(new URL('/api/lists', BASE_URL), { method, headers: origin ? { origin, host: 'localhost:3000' } : { host: 'localhost:3000' } });

  test('writes from another site are blocked', () => {
    assert.equal(proxy(request('https://evil.example.com')).status, 403);
  });
  test('same-site writes and reads pass', () => {
    assert.notEqual(proxy(request(BASE_URL)).status, 403);
    assert.notEqual(proxy(request('https://evil.example.com', 'GET')).status, 403);
  });
  test('non-browser clients without an Origin header pass (they cannot carry a victim cookie)', () => {
    assert.notEqual(proxy(request(null)).status, 403);
  });
});
