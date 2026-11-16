import { route } from '@/lib/api/route';
import { emailStats } from '@/lib/admin/emails';

export const GET = route({ permission: 'emails.read' }, async () => emailStats());
