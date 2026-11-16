/**
 * The sign-up ticket lives in this tab's session storage between the sign-up
 * form and the code form. It only works together with the emailed code.
 */
const KEY = 'jp-verify';

export interface PendingVerification {
  ticket: string;
  email: string;
  next: string | null;
}

export function storeVerification(value: PendingVerification): void {
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function readVerification(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVerification;
    return /^[a-f0-9]{64}$/.test(parsed.ticket) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearVerification(): void {
  sessionStorage.removeItem(KEY);
}
