import { route } from '@/lib/api/route';
import { systemStatus } from '@/lib/admin/operations';

export const GET = route({ permission: 'overview.read' }, async () => systemStatus());
