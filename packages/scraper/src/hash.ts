import crypto from 'crypto';

/**
 * Normalizes cleaned content string and generates a SHA-256 hash.
 */
export function generateContentHash(normalizedContent: string): string {
  const clean = (normalizedContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(clean).digest('hex');
}
