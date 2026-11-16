import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { ApiError, errors } from '@/lib/api/errors';
import { db } from '@/lib/db/client';
import { emailApprovals, oauthAccounts, passwordResets, sentEmailLogs, users } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/send';
import { accountExistsEmail, otpEmail, passwordChangedEmail, passwordResetEmail, welcomeEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/security/rateLimit';
import { cleanText } from '@/lib/security/html';
import { getSetting } from '@/lib/settings/store';
import { isValidTimezone } from '@/lib/utils/digestSchedule';
import type { GoogleIdentity } from './google';
import { burnPasswordCheck, hashPassword, validatePassword, verifyPassword } from './password';
import { isStaff } from './rbac';
import { invalidateSessionCache, revokeAllSessions } from './session';
import { generateToken, hashToken } from './tokens';
import {
  checkVerification,
  clearVerifications,
  issueVerification,
  pendingVerifications,
  reissueCode,
  verificationCooldown,
} from './verification';

/**
 * Account lifecycle: sign-up, verification, sign-in, Google sign-in and
 * password reset. Route handlers stay thin and call into this module.
 *
 * Enumeration: no response reveals whether an address is registered. Sign-up
 * for an existing address answers exactly like a new sign-up and emails the
 * owner instead; reset requests always answer the same way.
 */

const RESET_TTL_MS = 60 * 60_000;
const INVALID_CREDENTIALS = 'That email and password do not match an account.';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invalidCredentials(): ApiError {
  return new ApiError(401, 'invalid_credentials', INVALID_CREDENTIALS);
}

function suspended(): ApiError {
  return new ApiError(403, 'account_suspended', 'This account has been suspended. Contact support if you think this is a mistake.');
}

async function sendVerificationCode(email: string, code: string, userId: string): Promise<void> {
  const rendered = otpEmail(code);
  await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'otp', userId });
}

/** Sends the welcome email the first time an address is approved, never again. */
export async function sendWelcomeOnce(userId: string, email: string, name?: string | null): Promise<void> {
  const [previous] = await db
    .select({ id: sentEmailLogs.id })
    .from(sentEmailLogs)
    .where(and(eq(sentEmailLogs.recipientEmail, email), eq(sentEmailLogs.templateType, 'welcome'), eq(sentEmailLogs.status, 'sent')))
    .limit(1);
  if (previous) return;
  const rendered = welcomeEmail(name);
  await sendEmail({ to: email, toName: name, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'welcome', userId });
}

/**
 * Records that an address may receive alert emails. New addresses are
 * approved automatically when the platform allows it (and the bootstrap
 * owner always is); otherwise they wait for an administrator.
 */
export async function ensureEmailApproval(userId: string, email: string, name?: string | null): Promise<string> {
  const auto = (await getSetting('email.auto_approve_enabled')) || env.adminBootstrapEmail === email;
  const [existing] = await db.select({ status: emailApprovals.status }).from(emailApprovals).where(eq(emailApprovals.email, email));

  let status: string;
  if (!existing) {
    const [row] = await db
      .insert(emailApprovals)
      .values({ email, userId, status: auto ? 'approved' : 'pending', approvedAt: auto ? new Date() : null })
      .onConflictDoUpdate({ target: emailApprovals.email, set: { userId } })
      .returning({ status: emailApprovals.status });
    status = row.status;
  } else if (existing.status === 'pending' && auto) {
    await db.update(emailApprovals).set({ status: 'approved', approvedAt: new Date(), userId }).where(eq(emailApprovals.email, email));
    status = 'approved';
  } else {
    await db.update(emailApprovals).set({ userId }).where(eq(emailApprovals.email, email));
    status = existing.status;
  }

  if (status === 'approved') await sendWelcomeOnce(userId, email, name);
  return status;
}

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}

export async function registerAccount(input: RegisterInput): Promise<{ ticket: string; email: string }> {
  if (!(await getSetting('auth.signup_enabled'))) {
    throw errors.forbidden('New sign-ups are paused at the moment. Please try again later.');
  }

  const email = normalizeEmail(input.email);
  const name = cleanText(input.name, 80) || null;
  const policy = validatePassword(input.password, { email, name });
  if (!policy.valid) throw errors.validation([{ field: 'password', message: policy.reason }], policy.reason);

  const perAddress = await rateLimit({ key: `register:email:${email}`, limit: 5, windowSeconds: 3600, distributed: true });
  if (!perAddress.allowed) throw errors.tooManyRequests(perAddress.retryAfterSeconds);

  const [existing] = await db
    .select({ id: users.id, name: users.name, emailVerified: users.emailVerified, isBlocked: users.isBlocked })
    .from(users)
    .where(eq(users.email, email));

  if (existing && (existing.emailVerified || existing.isBlocked)) {
    // Answer exactly as for a new account, and tell the real owner instead.
    if (existing.emailVerified) {
      const notice = await rateLimit({ key: `account-exists:${existing.id}`, limit: 1, windowSeconds: 3600 });
      if (notice.allowed) {
        const rendered = accountExistsEmail(existing.name);
        await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'general', userId: existing.id });
      }
    }
    return { ticket: generateToken(), email };
  }

  let userId = existing?.id;
  if (userId) {
    const cooldown = await verificationCooldown(userId);
    if (cooldown > 0) throw errors.tooManyRequests(cooldown, `A code was just sent. Please wait ${cooldown} seconds before requesting another.`);
  } else {
    const timezone = input.timezone && isValidTimezone(input.timezone) ? input.timezone : 'UTC';
    const [created] = await db
      .insert(users)
      .values({ email, emailVerified: false, timezone })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id });
    userId = created?.id;
    if (!userId) {
      // Lost a race with a simultaneous sign-up for the same address.
      const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
      userId = row.id;
    }
  }

  const passwordHash = await hashPassword(input.password);
  const issued = await issueVerification(userId, { passwordHash, name });
  await sendVerificationCode(email, issued.code, userId);
  return { ticket: issued.ticket, email };
}

export async function resendVerificationCode(ticket: string): Promise<{ retryAfterSeconds?: number }> {
  const result = await reissueCode(ticket);
  if (!result.ok) {
    if (result.reason === 'cooldown') return { retryAfterSeconds: result.retryAfterSeconds };
    // Unknown ticket: answer as if a code was sent.
    return {};
  }
  const [user] = await db.select({ email: users.email, emailVerified: users.emailVerified }).from(users).where(eq(users.id, result.userId));
  if (user && !user.emailVerified) await sendVerificationCode(user.email, result.code, result.userId);
  return {};
}

export async function completeVerification(ticket: string, code: string): Promise<{ userId: string; email: string }> {
  const result = await checkVerification(ticket, code);
  if (!result.ok) {
    switch (result.reason) {
      case 'invalid_code':
        throw new ApiError(400, 'invalid_code', `That code is not correct. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'attempt' : 'attempts'} left.`);
      case 'too_many_attempts':
        throw new ApiError(400, 'too_many_attempts', 'Too many incorrect attempts. Request a new code.');
      default:
        throw new ApiError(400, 'code_expired', 'This code has expired. Request a new one.');
    }
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, isBlocked: users.isBlocked })
    .from(users)
    .where(eq(users.id, result.userId));
  if (!user) throw new ApiError(400, 'code_expired', 'This code has expired. Request a new one.');
  if (user.isBlocked) throw suspended();

  await db.transaction(async tx => {
    await tx
      .update(users)
      .set({
        emailVerified: true,
        ...(result.pendingPasswordHash ? { passwordHash: result.pendingPasswordHash, passwordChangedAt: new Date() } : {}),
        ...(result.pendingName ? { name: result.pendingName } : {}),
      })
      .where(eq(users.id, user.id));
    await clearVerifications(user.id, tx);
  });

  invalidateSessionCache(user.id);
  await ensureEmailApproval(user.id, user.email, result.pendingName ?? user.name);
  return { userId: user.id, email: user.email };
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export type AuthenticationResult = { status: 'ok'; userId: string; role: string } | { status: 'unverified'; ticket: string; email: string };

export async function authenticate(rawEmail: string, password: string): Promise<AuthenticationResult> {
  const email = normalizeEmail(rawEmail);
  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }

  if (!user.emailVerified) {
    // Someone who registered but never entered their code. The password they
    // chose lives on the pending verification (or, for accounts created before
    // this flow existed, on the account). Knowing it proves they started the
    // sign-up, so a fresh code is sent and verification resumes.
    const pending = await pendingVerifications(user.id);
    let matched: { hash: string; name: string | null } | null = null;
    for (const row of pending) {
      if (row.pendingPasswordHash && (await verifyPassword(password, row.pendingPasswordHash))) {
        matched = { hash: row.pendingPasswordHash, name: row.pendingName };
        break;
      }
    }
    if (!matched && user.passwordHash && (await verifyPassword(password, user.passwordHash))) {
      matched = { hash: user.passwordHash, name: null };
    }
    if (!matched) {
      if (pending.length === 0 && !user.passwordHash) await burnPasswordCheck(password);
      throw invalidCredentials();
    }
    if (user.isBlocked) throw suspended();
    const issued = await issueVerification(user.id, { passwordHash: matched.hash, name: matched.name });
    await sendVerificationCode(email, issued.code, user.id);
    return { status: 'unverified', ticket: issued.ticket, email };
  }

  if (!user.passwordHash) {
    await burnPasswordCheck(password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(password, user.passwordHash))) throw invalidCredentials();
  if (user.isBlocked) throw suspended();

  if (!isStaff(user.role) && !(await getSetting('auth.login_enabled'))) {
    throw errors.unavailable('Sign-in is temporarily unavailable. Please try again later.');
  }
  return { status: 'ok', userId: user.id, role: user.role };
}

export async function signInWithGoogle(identity: GoogleIdentity): Promise<{ userId: string; created: boolean; role: string }> {
  let [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      googleId: users.googleId,
      avatarUrl: users.avatarUrl,
      emailVerified: users.emailVerified,
      isBlocked: users.isBlocked,
    })
    .from(users)
    .where(eq(users.googleId, identity.googleId));

  if (!user) {
    [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        googleId: users.googleId,
        avatarUrl: users.avatarUrl,
        emailVerified: users.emailVerified,
        isBlocked: users.isBlocked,
      })
      .from(users)
      .where(eq(users.email, identity.email));
  }

  if (user) {
    if (user.isBlocked) throw suspended();
    if (!isStaff(user.role) && !(await getSetting('auth.login_enabled'))) {
      throw errors.unavailable('Sign-in is temporarily unavailable. Please try again later.');
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    if (!user.googleId) updates.googleId = identity.googleId;
    if (!user.avatarUrl && identity.picture) updates.avatarUrl = identity.picture;
    if (!user.name && identity.name) updates.name = identity.name;
    if (!user.emailVerified) {
      // Google has just proven ownership of the address. Any password on an
      // unverified account was set by whoever registered it, who may not be
      // this person, so it is discarded.
      updates.emailVerified = true;
      updates.passwordHash = null;
    }
    if (Object.keys(updates).length > 0) await db.update(users).set(updates).where(eq(users.id, user.id));
    if (!user.emailVerified) await clearVerifications(user.id);

    await db
      .insert(oauthAccounts)
      .values({ userId: user.id, provider: 'google', providerId: identity.googleId, email: identity.email })
      .onConflictDoNothing();
    invalidateSessionCache(user.id);
    await ensureEmailApproval(user.id, user.email, user.name ?? identity.name);
    return { userId: user.id, created: false, role: user.role };
  }

  if (!(await getSetting('auth.signup_enabled'))) {
    throw errors.forbidden('New sign-ups are paused at the moment. Please try again later.');
  }

  const [created] = await db
    .insert(users)
    .values({
      email: identity.email,
      name: identity.name,
      googleId: identity.googleId,
      avatarUrl: identity.picture,
      emailVerified: true,
    })
    .returning({ id: users.id, role: users.role });
  await db.insert(oauthAccounts).values({ userId: created.id, provider: 'google', providerId: identity.googleId, email: identity.email }).onConflictDoNothing();
  await ensureEmailApproval(created.id, identity.email, identity.name);
  return { userId: created.id, created: true, role: created.role };
}

// ---------------------------------------------------------------------------
// Password reset & change
// ---------------------------------------------------------------------------

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const perAddress = await rateLimit({ key: `reset:email:${email}`, limit: 3, windowSeconds: 3600, distributed: true });
  if (!perAddress.allowed) return; // same response either way

  const [user] = await db.select({ id: users.id, name: users.name, isBlocked: users.isBlocked }).from(users).where(eq(users.email, email));
  if (!user || user.isBlocked) return;

  const token = generateToken();
  await db.insert(passwordResets).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  const rendered = passwordResetEmail(`${env.appUrl}/reset-password?token=${token}`, user.name);
  await sendEmail({ to: email, toName: user.name, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'reset', userId: user.id });
}

export async function resetPasswordWithToken(token: string, password: string): Promise<{ userId: string }> {
  const invalid = new ApiError(400, 'invalid_token', 'This reset link is invalid or has expired. Request a new one.');
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalid;

  const [reset] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId })
    .from(passwordResets)
    .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  if (!reset) throw invalid;

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, isBlocked: users.isBlocked })
    .from(users)
    .where(eq(users.id, reset.userId));
  if (!user) throw invalid;
  if (user.isBlocked) throw suspended();

  const policy = validatePassword(password, { email: user.email, name: user.name });
  if (!policy.valid) throw errors.validation([{ field: 'password', message: policy.reason }], policy.reason);
  const passwordHash = await hashPassword(password);

  await db.transaction(async tx => {
    // Clicking the emailed link proves ownership of the address, so this also verifies it.
    await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), emailVerified: true }).where(eq(users.id, user.id));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
    await tx.delete(passwordResets).where(and(eq(passwordResets.userId, user.id), ne(passwordResets.id, reset.id)));
    await clearVerifications(user.id, tx);
  });

  await revokeAllSessions(user.id);
  const rendered = passwordChangedEmail(user.name);
  await sendEmail({ to: user.email, toName: user.name, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'general', userId: user.id });
  await ensureEmailApproval(user.id, user.email, user.name);
  return { userId: user.id };
}

/** Change (or, for Google-only accounts, set) the password of a signed-in user. */
export async function changePassword(
  userId: string,
  input: { currentPassword?: string; newPassword: string },
  keepSessionId: string,
): Promise<void> {
  const [user] = await db
    .select({ email: users.email, name: users.name, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw errors.notFound('Account');

  if (user.passwordHash) {
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw errors.validation([{ field: 'currentPassword', message: 'Your current password is not correct.' }], 'Your current password is not correct.');
    }
  }
  const policy = validatePassword(input.newPassword, { email: user.email, name: user.name });
  if (!policy.valid) throw errors.validation([{ field: 'newPassword', message: policy.reason }], policy.reason);

  await db.update(users).set({ passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() }).where(eq(users.id, userId));
  await revokeAllSessions(userId, keepSessionId);
  const rendered = passwordChangedEmail(user.name);
  await sendEmail({ to: user.email, toName: user.name, subject: rendered.subject, html: rendered.html, text: rendered.text, template: 'general', userId });
}
