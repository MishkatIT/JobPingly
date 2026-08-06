import crypto from 'crypto';

/**
 * Generates a cryptographically secure 6-digit numerical OTP string (e.g., "482910").
 */
export function generateOtp(): string {
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Hashes an OTP string using SHA-256 for secure DB storage.
 */
export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp.trim()).digest('hex');
}

/**
 * Safely compares plain OTP against stored OTP hash in constant time.
 */
export function verifyOtpHash(otp: string, storedHash: string): boolean {
  const computedHash = hashOtp(otp);
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Masks an email address for public display (e.g. "john.doe@example.com" -> "j***e@example.com").
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
