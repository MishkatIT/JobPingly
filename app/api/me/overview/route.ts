import { route } from '@/lib/api/route';
import { dashboardOverview } from '@/lib/users/service';

export const GET = route({}, async ({ user }) => dashboardOverview(user.id));
