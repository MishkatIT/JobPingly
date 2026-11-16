/**
 * Browser-safe link check (the server module imports Node's DNS APIs).
 * Use before rendering any URL that came from a scraped page or a user.
 */
export function isSafeHref(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
