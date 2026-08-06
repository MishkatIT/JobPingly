'use client';

import { useState, useEffect } from 'react';
import { Settings, Bell, User, Save, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function SettingsPage() {
  const toast = useToast();
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [notificationPreference, setNotificationPreference] = useState('daily');
  const [approvalStatus, setApprovalStatus] = useState('pending');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setName(data.user.name || '');
          setEmailNotificationsEnabled(data.user.emailNotificationsEnabled ?? true);
          setNotificationPreference(data.user.notificationPreference || 'daily');
          setApprovalStatus(data.user.emailApprovalStatus || 'pending');
        }
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/me/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          emailNotificationsEnabled,
          notificationPreference,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Settings saved successfully!');
        if (data.user?.emailApprovalStatus) {
          setApprovalStatus(data.user.emailApprovalStatus);
        }
      } else {
        toast.error(data.error || 'Failed to save settings');
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <LoadingSpinner message="Loading settings & preferences..." fullPage />;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          Settings &amp; Preferences
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
          Manage your account profile, email approval status, and job alert notification preferences
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Profile Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Email Address (Read-only)
              </label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Email Notification Digest Preferences */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Email Notification Preferences
            </h2>

            {/* Email Approval Status Badge */}
            {approvalStatus === 'approved' && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-extrabold uppercase">
                <CheckCircle2 className="w-4 h-4" /> Approved by Admin
              </span>
            )}
            {approvalStatus === 'pending' && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-xs font-extrabold uppercase">
                <Clock className="w-4 h-4" /> Pending Admin Approval
              </span>
            )}
            {approvalStatus === 'unapproved' && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-xs font-extrabold uppercase">
                <AlertTriangle className="w-4 h-4" /> Approval Revoked
              </span>
            )}
          </div>

          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Enable Email Digest Alerts</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Receive email summaries when new jobs match your target keyword filters.
                </p>
                {approvalStatus === 'pending' && emailNotificationsEnabled && (
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 shrink-0" /> Your email address is queued for admin approval before digest delivery begins.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !emailNotificationsEnabled;
                  setEmailNotificationsEnabled(next);
                  toast.info(`Email digest alerts ${next ? 'enabled' : 'disabled'}`);
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all shrink-0 uppercase tracking-wider cursor-pointer ${
                  emailNotificationsEnabled
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-300'
                }`}
              >
                {emailNotificationsEnabled ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Notification Frequency
              </label>
              <select
                value={notificationPreference}
                onChange={e => setNotificationPreference(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600"
              >
                <option value="daily">Daily Digest (Recommended - 8:00 AM summary)</option>
                <option value="instant">Instant Notification (Sends alert immediately upon scrape match)</option>
                <option value="weekly">Weekly Digest (Summary every Monday)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md flex items-center gap-2 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Preferences...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
