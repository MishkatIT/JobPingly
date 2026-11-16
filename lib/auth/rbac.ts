/**
 * Role-based access control.
 *
 * Authorisation is always decided on the server from the role stored on the
 * user's database row; the client only uses the same table to hide controls
 * the user cannot use.
 *
 * Roles are cumulative in spirit but defined explicitly, so adding a
 * permission never grants it to a role by accident.
 */

export const ROLES = ['user', 'support', 'moderator', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: Role[] = ['support', 'moderator', 'admin', 'owner'];

export const PERMISSIONS = {
  'admin.access': 'Open the admin panel',
  'overview.read': 'View platform metrics',

  'users.read': 'View user accounts and their activity',
  'users.manage': 'Verify, suspend and reactivate accounts',
  'users.delete': 'Delete accounts',
  'users.roles': 'Change user roles',
  'users.plans': 'Change user plans and exemptions',

  'sources.read': 'View monitored sources and scan history',
  'sources.manage': 'Add, edit, pause and rescan sources',
  'sources.delete': 'Delete sources and their jobs',

  'jobs.read': 'View discovered jobs',
  'jobs.manage': 'Hide and restore jobs',

  'lists.read': 'View all watchlists',
  'lists.manage': 'Edit, trash and restore any watchlist',
  'lists.delete': 'Permanently delete watchlists',

  'workers.read': 'View worker and queue health',
  'workers.manage': 'Run, retry and cancel monitoring tasks; pause monitoring',

  'emails.read': 'View email delivery logs',
  'emails.manage': 'Approve recipients, manage cohorts and quotas',
  'emails.send': 'Send test and broadcast emails',

  'issues.read': 'View reported issues',
  'issues.manage': 'Triage and resolve reported issues',

  'settings.read': 'View platform settings',
  'settings.manage': 'Change limits, feature flags and announcements',
  'settings.sensitive': 'Change sign-up and sign-in availability, maintenance mode and the email alert kill-switch',

  'audit.read': 'View the audit log',
  'data.export': 'Export platform data',
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

const SUPPORT: Permission[] = [
  'admin.access',
  'overview.read',
  'users.read',
  'users.manage',
  'sources.read',
  'jobs.read',
  'lists.read',
  'workers.read',
  'emails.read',
  'issues.read',
  'issues.manage',
];

const MODERATOR: Permission[] = [
  ...SUPPORT,
  'sources.manage',
  'jobs.manage',
  'lists.manage',
  'workers.manage',
  'settings.read',
  'audit.read',
];

/** Everything except the two powers that could lock the owner out or take the platform down. */
const OWNER_ONLY: Permission[] = ['users.roles', 'settings.sensitive'];
const ADMIN: Permission[] = ALL.filter(permission => !OWNER_ONLY.includes(permission));

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  user: new Set(),
  support: new Set(SUPPORT),
  moderator: new Set(MODERATOR),
  admin: new Set(ADMIN),
  owner: new Set(ALL),
};

export const ROLE_LABELS: Record<Role, string> = {
  user: 'User',
  support: 'Support',
  moderator: 'Moderator',
  admin: 'Admin',
  owner: 'Owner',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  user: 'A regular account with no access to the admin panel.',
  support: 'Read-only view of the platform, plus account support and issue triage.',
  moderator: 'Support, plus managing sources, jobs, watchlists and monitoring tasks.',
  admin: 'Everything except changing roles and sensitive platform switches.',
  owner: 'Full control, including roles, registration and maintenance mode.',
};

export function normalizeRole(role: string | null | undefined): Role {
  return (ROLES as readonly string[]).includes(role ?? '') ? (role as Role) : 'user';
}

export function can(role: string | null | undefined, permission: Permission): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].has(permission);
}

export function permissionsFor(role: string | null | undefined): Permission[] {
  return Array.from(ROLE_PERMISSIONS[normalizeRole(role)]);
}

export function isStaff(role: string | null | undefined): boolean {
  return can(role, 'admin.access');
}

const RANK: Record<Role, number> = { user: 0, support: 1, moderator: 2, admin: 3, owner: 4 };

export function roleRank(role: string | null | undefined): number {
  return RANK[normalizeRole(role)];
}

/**
 * Whether `actor` may change `target`'s role to `nextRole`.
 * - Requires the users.roles permission (owners only).
 * - Nobody can change their own role (prevents accidental self-lockout).
 */
export function canAssignRole(
  actor: { id: string; role: string },
  target: { id: string; role: string },
  nextRole: Role,
): { allowed: boolean; reason?: string } {
  if (!can(actor.role, 'users.roles')) return { allowed: false, reason: 'Only an owner can change roles.' };
  if (actor.id === target.id) return { allowed: false, reason: 'You cannot change your own role.' };
  if (!(ROLES as readonly string[]).includes(nextRole)) return { allowed: false, reason: 'Unknown role.' };
  return { allowed: true };
}

/**
 * Whether `actor` may suspend, delete or otherwise act on `target`'s account.
 * Staff can only act on accounts strictly below their own rank, so a
 * moderator cannot suspend an admin and an admin cannot suspend the owner.
 */
export function canActOnUser(actor: { id: string; role: string }, target: { id: string; role: string }): boolean {
  if (actor.id === target.id) return false;
  return roleRank(actor.role) > roleRank(target.role);
}
