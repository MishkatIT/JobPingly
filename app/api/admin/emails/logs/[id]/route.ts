import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { emailBody } from '@/lib/admin/emails';

/**
 * The stored HTML of a digest or broadcast, for inspection. The client shows
 * it in a sandboxed iframe (no scripts, no same-origin access). Bodies of
 * emails that carried codes or access links are never returned.
 */
export const GET = route({ permission: 'emails.read', params: idParams }, async ({ params }) => {
  const html = await emailBody(params.id);
  if (!html) throw errors.notFound('Stored email body');
  return { html };
});
