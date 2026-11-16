/**
 * The sign-up ticket lives in this tab's session storage between the sign-up
 * form and the code form. It only works together with the emailed code.
 */
import { writeStoredString } from '@/lib/client/use-storage';

export const VERIFICATION_KEY = 'jp-verify';

export interface PendingVerification {
  ticket: string;
  email: string;
  next: string | null;
}

export function storeVerification(value: PendingVerification): void {
  writeStoredString('session', VERIFICATION_KEY, JSON.stringify(value));
}

export function parseVerification(raw: string | null): PendingVerification | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingVerification;
    return /^[a-f0-9]{64}$/.test(parsed.ticket) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearVerification(): void {
  writeStoredString('session', VERIFICATION_KEY, null);
}
