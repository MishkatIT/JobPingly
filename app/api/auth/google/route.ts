import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/route';
import { recordAudit } from '@/lib/audit';
import { signInWithGoogle } from '@/lib/auth/accounts';
import { GoogleAuthError, verifyGoogleCredential } from '@/lib/auth/google';
import { isStaff } from '@/lib/auth/rbac';
import { landingPathFor, sessionResponse } from '@/lib/auth/respond';

const body = z.object({
  credential: z.string().min(20).max(5000),
  next: z.string().max(500).optional(),
});

export const POST = route(
  { auth: 'public', body, allowInMaintenance: true, rateLimit: { name: 'auth:google', limit: 30, windowSeconds: 900 } },
  async ({ req, body }) => {
    let identity;
    try {
      identity = await verifyGoogleCredential(body.credential);
    } catch (error) {
      if (error instanceof GoogleAuthError) throw new ApiError(401, 'google_failed', error.message);
      throw error;
    }

    const result = await signInWithGoogle(identity);
    if (isStaff(result.role)) {
      await recordAudit({
        action: 'auth.admin_login',
        actor: { id: result.userId, email: identity.email, role: result.role },
        targetType: 'user',
        targetId: result.userId,
        metadata: { method: 'google' },
        req,
      });
    }
    return sessionResponse(result.userId, req, { status: 'signed_in', created: result.created, redirectTo: await landingPathFor(result.userId, body.next) });
  },
);
