import { sql, type SQL } from 'drizzle-orm';
import { users } from '@/lib/db/schema';

/**
 * Uploaded avatars are stored in `users.avatar_url` as base64 data URLs.
 * Returning them inline bloated every API response that mentioned a user (a
 * list of 20 watchlists repeated the same 100 KB image 20 times). API
 * responses now carry a short, cacheable URL instead and the image itself is
 * served by /api/avatar/[id].
 *
 * Use `avatarUrlSql` in SELECT lists so the heavy column never leaves the
 * database.
 */
export const avatarUrlSql: SQL<string | null> = sql<string | null>`
  CASE
    WHEN ${users.avatarUrl} IS NULL OR ${users.avatarUrl} = '' THEN NULL
    WHEN ${users.avatarUrl} LIKE 'data:%' THEN '/api/avatar/' || ${users.id}::text || '?v=' || substr(md5(${users.avatarUrl}), 1, 8)
    ELSE ${users.avatarUrl}
  END
`;

export const MAX_AVATAR_BYTES = 256 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export interface ParsedAvatar {
  mime: string;
  bytes: Buffer;
}

/** Parses and validates a base64 image data URL. SVG is rejected: it can carry script. */
export function parseAvatarDataUrl(value: string): ParsedAvatar | null {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!ALLOWED_AVATAR_TYPES.has(mime)) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return null;
  return { mime, bytes };
}

/** Accepts an https image URL or a small base64 raster image. Returns null when invalid. */
export function normalizeAvatarInput(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  if (value.startsWith('data:')) return parseAvatarDataUrl(value) ? value : undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && value.length <= 1024 ? value : undefined;
  } catch {
    return undefined;
  }
}
