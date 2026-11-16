import { route } from '@/lib/api/route';
import { adminOverview } from '@/lib/admin/overview';

export const GET = route({ permission: 'overview.read' }, async () => adminOverview());
