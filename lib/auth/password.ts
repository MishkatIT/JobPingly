import bcrypt from 'bcryptjs';

const COST = 10;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only considers the first 72 bytes; longer input would be silently truncated. */
export const PASSWORD_MAX_BYTES = 72;

/** The passwords attackers try first. Not a breach corpus, just the obvious ones. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'qwertyuiop', '11111111', '00000000', 'iloveyou', 'admin123', 'administrator',
  'welcome1', 'welcome123', 'letmein1', 'abc12345', 'abcd1234', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx',
  'football', 'baseball', 'sunshine', 'princess', 'jobpingly', 'jobpingly1', 'jobpingly123', 'changeme',
  'bangladesh', 'bangladesh1', 'bangladesh123', 'computer', 'superman', 'trustno1', 'asdfghjk', 'asdf1234',
]);

export interface PasswordCheck {
  valid: boolean;
  reason?: string;
}

export function validatePassword(password: unknown, context: { email?: string; name?: string | null } = {}): PasswordCheck {
  if (typeof password !== 'string') return { valid: false, reason: 'Enter a password.' };
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: `Use at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return { valid: false, reason: `Use at most ${PASSWORD_MAX_BYTES} characters.` };
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return { valid: false, reason: 'That password is too common. Choose something harder to guess.' };
  }
  if (/^(.)\1+$/.test(password)) {
    return { valid: false, reason: 'A password cannot be a single repeated character.' };
  }
  const emailLocal = context.email?.split('@')[0]?.toLowerCase();
  if (emailLocal && emailLocal.length >= 4 && lower === emailLocal) {
    return { valid: false, reason: 'Your password cannot be your email address.' };
  }
  if (context.email && lower === context.email.toLowerCase()) {
    return { valid: false, reason: 'Your password cannot be your email address.' };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

// A real hash of a random value. Comparing against it when the account does
// not exist keeps the response time the same as for a wrong password, so the
// login endpoint does not reveal which emails are registered.
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= bcrypt.hash('jobpingly-timing-equaliser', COST);
  await bcrypt.compare(password, await dummyHash).catch(() => false);
}
