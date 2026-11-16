import { route } from '@/lib/api/route';
import { completeOnboarding } from '@/lib/users/service';

export const POST = route({}, async ({ user }) => {
  await completeOnboarding(user.id);
  return { completed: true };
});
