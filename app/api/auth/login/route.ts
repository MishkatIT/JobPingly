import { z } from 'zod';
import { errors } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { recordAudit } from '@/lib/audit';
import { authenticate, normalizeEmail } from '@/lib/auth/accounts';
import { isStaff } from '@/lib/auth/rbac';
import { landingPathFor, sessionResponse } from '@/lib/auth/respond';
import { rateLimit } from '@/lib/security/rateLimit';

const body = z.object({
  email: z.email('Enter a valid email address.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
  next: z.string().max(500).optional(),
});

export const POST = route(
  {
    auth: 'public',
    body,
    allowInMaintenance: true,
    rateLimit: { name: 'auth:login', limit: 30, windowSeconds: 900, distributed: true },
  },
  async ({ req, body }) => {
    const email = normalizeEmail(body.email);
    // A per-address limit stops password guessing that is spread across many IPs.
    const perAddress = await rateLimit({ key: `auth:login:email:${email}`, limit: 10, windowSeconds: 900, distributed: true });
    if (!perAddress.allowed) {
      throw errors.tooManyRequests(perAddress.retryAfterSeconds, 'Too many sign-in attempts for this account. Try again later or reset your password.');
    }

    const result = await authenticate(email, body.password);
    if (result.status === 'unverified') {
      return { status: 'verification_required', ticket: result.ticket, email: result.email };
    }
    if (isStaff(result.role)) {
      await recordAudit({ action: 'auth.admin_login', actor: { id: result.userId, email, role: result.role }, targetType: 'user', targetId: result.userId, req });
    }
    return sessionResponse(result.userId, req, { status: 'signed_in', redirectTo: await landingPathFor(result.userId, body.next) });
  },
);
