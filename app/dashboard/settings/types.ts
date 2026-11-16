/** The profile returned by GET /api/me. */
export interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  socials: Record<string, string>;
  timezone: string;
  role: string;
  plan: { id: string; label: string };
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
  limits: { lists: number | null; companiesPerList: number | null; keywordsPerAlert: number | null };
  usage: { lists: number };
}
