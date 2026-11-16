import { errors } from '@/lib/api/errors';
import { idParams, route } from '@/lib/api/route';
import { deleteNotification } from '@/lib/notifications/inapp';

export const DELETE = route({ params: idParams }, async ({ user, params }) => {
  if (!(await deleteNotification(user.id, params.id))) throw errors.notFound('Notification');
  return { deleted: true };
});
