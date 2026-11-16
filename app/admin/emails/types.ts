/** Shapes returned by the admin email APIs (lib/admin/emails.ts). */

export interface EmailStats {
  provider: string;
  sender: string;
  webhookConfigured: boolean;
  today: { sentToday: number; failedToday: number; totalToday: number; dailyLimit: number; digestLimit: number; remaining: number };
  policy: {
    notificationsEnabled: boolean;
    dailyLimit: number;
    safetyBuffer: number;
    effectiveDigestLimit: number;
    cycleDays: number;
    cohortGroupingEnabled: boolean;
    cohortPressureRatio: number;
    cohortPressureThreshold: number;
    globalPolicyEnforced: boolean;
    enforcedFrequencyValue: string;
    enforcedDigestHour: number | null;
    enforcedDigestMinute: number | null;
    todayCohort: number;
    requireApproval: boolean;
  };
  series: { day: string; sent: number; failed: number }[];
  byTemplate: { template: string; sent: number; failed: number }[];
  delivery: { status: string; count: number }[];
  pending: { alerts: number; recipients: number; approvals: number };
  cohorts: { cycleDays: number; todayCohort: number; distribution: { group: number; users: number }[] };
}

export const TEMPLATE_LABELS: Record<string, string> = {
  otp: 'Verification code',
  digest: 'Job alert digest',
  invite: 'Watchlist invitation',
  reset: 'Password reset',
  welcome: 'Welcome',
  broadcast: 'Announcement',
  test: 'Test',
  reminder: 'Reminder',
  general: 'Account notice',
};
