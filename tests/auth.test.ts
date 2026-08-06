import { describe, it, expect } from 'vitest';
import { generateOtp, hashOtp, verifyOtpHash, maskEmail } from '../lib/auth/otp';
import { checkRateLimit } from '../lib/security/rateLimit';

describe('Auth & OTP Utility Tests', () => {
  it('should generate a 6-digit numerical OTP', () => {
    const otp = generateOtp();
    expect(otp).toHaveLength(6);
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it('should correctly hash and verify OTPs', () => {
    const otp = '482910';
    const hash = hashOtp(otp);
    expect(hash).not.toBe(otp);
    expect(verifyOtpHash(otp, hash)).toBe(true);
    expect(verifyOtpHash('000000', hash)).toBe(false);
  });

  it('should correctly mask email addresses', () => {
    expect(maskEmail('miskat@gmail.com')).toBe('m***t@gmail.com');
    expect(maskEmail('ab@domain.com')).toBe('a***@domain.com');
    expect(maskEmail('john.doe@company.org')).toBe('j***e@company.org');
  });

  it('should enforce rate limits correctly', () => {
    const key = `test_key_${Date.now()}`;
    const opts = { key, limit: 3, windowMs: 60000 };

    expect(checkRateLimit(opts).success).toBe(true);
    expect(checkRateLimit(opts).success).toBe(true);
    expect(checkRateLimit(opts).success).toBe(true);
    // 4th attempt should fail
    expect(checkRateLimit(opts).success).toBe(false);
  });
});
