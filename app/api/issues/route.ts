import { z } from 'zod';
import { created, route } from '@/lib/api/route';
import { ISSUE_CATEGORIES } from '@/lib/constants';
import { db } from '@/lib/db/client';
import { reportedIssues } from '@/lib/db/schema';
import { cleanText } from '@/lib/security/html';
import { isSafeHref } from '@/lib/security/ssrf';

const body = z.object({
  category: z.enum(ISSUE_CATEGORIES).default('general'),
  subject: z.string().trim().min(3, 'Add a short subject.').max(140),
  description: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(5000),
  email: z.email('Enter a valid email so we can reply.').max(254).optional(),
  name: z.string().max(80).optional(),
  targetUrl: z.string().max(2000).optional(),
});

/** Feedback and problem reports, from signed-in users or visitors. */
export const POST = route(
  { auth: 'optional', body, rateLimit: { name: 'issues:create', limit: 5, windowSeconds: 900, distributed: true } },
  async ({ user, body }) => {
    const email = user?.email ?? body.email;
    if (!email) {
      const { errors } = await import('@/lib/api/errors');
      throw errors.validation([{ field: 'email', message: 'Enter your email so we can reply.' }]);
    }
    const [issue] = await db
      .insert(reportedIssues)
      .values({
        userId: user?.id ?? null,
        reporterEmail: email.toLowerCase(),
        reporterName: cleanText(user?.name ?? body.name, 80) || null,
        category: body.category,
        subject: cleanText(body.subject, 140),
        description: body.description,
        targetUrl: body.targetUrl && isSafeHref(body.targetUrl) ? body.targetUrl : null,
      })
      .returning({ id: reportedIssues.id });
    return created({ id: issue.id });
  },
);
