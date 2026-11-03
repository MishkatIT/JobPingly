'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Bell, User, Clock, AlertTriangle, Trash2, Camera, Globe, Lock } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Badge } from '@/components/Badge';
import { pluralize } from '@/lib/utils/pluralize';
import {
  FREQUENCY_OPTIONS,
  parseCustomFrequency,
  buildCustomFrequency,
} from '@/lib/utils/frequency';
import { describeDigestSchedule, getScheduleKind } from '@/lib/utils/digestSchedule';
import { getSelectableTimezones, detectBrowserTimezone } from '@/lib/utils/timezones';

export default function SettingsPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [notificationPreference, setNotificationPreference] = useState('daily');
  const [digestHour, setDigestHour] = useState(8);
  const [digestMinute, setDigestMinute] = useState(0);
  const [timezone, setTimezone] = useState('UTC');
  const [nextDigestAt, setNextDigestAt] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState('pending');
  const [frequencyEnforcement, setFrequencyEnforcement] = useState<{
    isEnforced: boolean;
    enforcedFrequency: string;
    enforcedDigestHour?: number | null;
    enforcedDigestMinute?: number | null;
    isExempt: boolean;
  } | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const timezoneOptions = useRef<string[]>([]);
  if (timezoneOptions.current.length === 0) {
    timezoneOptions.current = getSelectableTimezones();
  }

  // Social Links State
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [twitter, setTwitter] = useState('');
  const [website, setWebsite] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setName(data.user.name || '');
          setAvatarUrl(data.user.avatarUrl || '');
          setEmailNotificationsEnabled(data.user.emailNotificationsEnabled ?? true);
          setNotificationPreference(data.user.notificationPreference || 'daily');
          setDigestHour(Number.isFinite(data.user.digestHour) ? data.user.digestHour : 8);
          setDigestMinute(Number.isFinite(data.user.digestMinute) ? data.user.digestMinute : 0);
          setTimezone(data.user.timezone || 'UTC');
          setNextDigestAt(data.user.nextDigestAt || null);
          setApprovalStatus(data.user.emailApprovalStatus || 'pending');
          if (data.user.frequencyEnforcement) {
            setFrequencyEnforcement(data.user.frequencyEnforcement);
          }

          const soc = data.user.socials || {};
          setGithub(soc.github || '');
          setLinkedin(soc.linkedin || '');
          setTwitter(soc.twitter || '');
          setWebsite(soc.website || '');
        }
      });
  }, []);

  const saveSetting = async (fields: {
    name?: string;
    avatarUrl?: string;
    emailNotificationsEnabled?: boolean;
    notificationPreference?: string;
    digestHour?: number;
    digestMinute?: number;
    timezone?: string;
    socials?: { github?: string; linkedin?: string; twitter?: string; website?: string };
  }, fieldKey?: string) => {
    if (fieldKey) setSavingField(fieldKey);

    try {
      const res = await fetch('/api/me/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.user?.emailApprovalStatus) {
          setApprovalStatus(data.user.emailApprovalStatus);
        }
        if (data.user?.nextDigestAt !== undefined) {
          setNextDigestAt(data.user.nextDigestAt || null);
        }
        setUser((prev: any) => ({ ...prev, ...data.user }));
        return true;
      } else {
        toast.error(data.error || 'Failed to update setting');
        return false;
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`);
      return false;
    } finally {
      setSavingField(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG, JPG, WebP, GIF)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarUrl(dataUrl);
          const ok = await saveSetting({ avatarUrl: dataUrl }, 'avatar');
          if (ok) {
            toast.success('Profile picture updated successfully!');
          }
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    setAvatarUrl('');
    const ok = await saveSetting({ avatarUrl: '' }, 'avatar');
    if (ok) {
      toast.info('Profile picture removed.');
    }
  };

  const handleNameBlur = async () => {
    if (user && name.trim() !== (user.name || '')) {
      const ok = await saveSetting({ name: name.trim() }, 'name');
      if (ok) {
        toast.success('Display name updated!');
      }
    }
  };

  const handleToggleDigest = async () => {
    const next = !emailNotificationsEnabled;
    const ok = await saveSetting({ emailNotificationsEnabled: next }, 'digest');
    if (ok) {
      setEmailNotificationsEnabled(next);
      toast.success(`Email digest alerts ${next ? 'enabled' : 'disabled'}`);
    }
  };

  const handleFrequencyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    // Picking "Custom" opens the number/unit controls; it is not itself a value
    // the scheduler understands, so seed a concrete custom frequency instead.
    const nextPref = selected === 'custom' ? buildCustomFrequency(3, 'hours') : selected;
    setNotificationPreference(nextPref);
    const ok = await saveSetting({ notificationPreference: nextPref }, 'frequency');
    if (ok) {
      toast.success('Notification frequency updated!');
    }
  };

  const handleCustomFrequencyChange = async (num: number, unit: 'hours' | 'days' | 'weeks') => {
    const nextPref = buildCustomFrequency(num, unit);
    setNotificationPreference(nextPref);
    const ok = await saveSetting({ notificationPreference: nextPref }, 'frequency');
    if (ok) {
      toast.success(`Custom frequency set to every ${num} ${unit}.`);
    }
  };

  const handleDigestTimeChange = async (nextHour: number, nextMinute: number) => {
    setDigestHour(nextHour);
    setDigestMinute(nextMinute);
    const ok = await saveSetting({ digestHour: nextHour, digestMinute: nextMinute }, 'digestTime');
    if (ok) {
      toast.success(`Digest delivery time set to ${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}.`);
    }
  };

  const handleTimezoneChange = async (nextTz: string) => {
    setTimezone(nextTz);
    const ok = await saveSetting({ timezone: nextTz }, 'timezone');
    if (ok) {
      toast.success(`Timezone set to ${nextTz}.`);
    }
  };

  const handleSocialsSave = async () => {
    const currentSocials = user?.socials || {};
    const newSocials = {
      github: github.trim(),
      linkedin: linkedin.trim(),
      twitter: twitter.trim(),
      website: website.trim(),
    };

    if (
      newSocials.github !== (currentSocials.github || '') ||
      newSocials.linkedin !== (currentSocials.linkedin || '') ||
      newSocials.twitter !== (currentSocials.twitter || '') ||
      newSocials.website !== (currentSocials.website || '')
    ) {
      const ok = await saveSetting({ socials: newSocials }, 'socials');
      if (ok) {
        toast.success('Social profiles saved successfully!');
      }
    }
  };

  if (!user) return <LoadingSpinner message="Loading settings & preferences..." fullPage />;

  const detectedTimezone = detectBrowserTimezone();
  const timeEnforcedByAdmin = Boolean(
    frequencyEnforcement?.isEnforced &&
    frequencyEnforcement?.enforcedDigestHour !== null &&
    frequencyEnforcement?.enforcedDigestHour !== undefined,
  );
  const isRealtimeSchedule = getScheduleKind(notificationPreference) === 'realtime';
  // One indicator for the whole schedule group rather than one per control.
  const scheduleSaving = ['frequency', 'digestTime', 'timezone'].includes(savingField || '');

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Hidden File Input for Local Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/webp, image/gif"
        className="hidden"
      />

      {/* Title Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          Settings &amp; Preferences
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
          Manage your account profile, profile picture, social links, email approval status, and job alert notification preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Details Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Profile Details
          </h2>

          {/* Avatar / Profile Picture Hover Editor */}
          <div className="flex items-center gap-6 pb-6 border-b border-slate-200 dark:border-slate-800/80">
            <div className="relative group shrink-0">
              {/* Avatar Image or Letter Initial */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile Avatar"
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-blue-600 shadow-md group-hover:brightness-75 transition-all"
                  onError={() => setAvatarUrl('')}
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-extrabold text-3xl flex items-center justify-center shadow-md border-2 border-blue-600/30 group-hover:brightness-90 transition-all">
                  {name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                </div>
              )}

              {/* Hover Camera Overlay Trigger */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={savingField === 'avatar'}
                className="absolute inset-0 rounded-2xl bg-slate-900/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-bold gap-1 cursor-pointer disabled:opacity-50"
                title="Click to upload profile photo"
              >
                <Camera className="w-6 h-6 text-white" />
                <span>{savingField === 'avatar' ? 'Saving...' : 'Upload'}</span>
              </button>

              {/* Remove Photo trash badge if avatar exists */}
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={savingField === 'avatar'}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer disabled:opacity-50"
                  title="Remove Profile Picture"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{name || user.email}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hover or click on your photo to change your picture (Auto-saved instantly).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Display Name
                </label>
                {savingField === 'name' && (
                  <span className="text-[10px] text-blue-500 font-semibold animate-pulse">Saving...</span>
                )}
              </div>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Your Name"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 transition-colors"
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

        {/* Social Profiles & Public Links Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Social Profiles &amp; Public Links
            </h2>
            {savingField === 'socials' && (
              <span className="text-[10px] text-blue-500 font-semibold animate-pulse">Saving...</span>
            )}
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            These links are displayed on your public curator profile when visitors view your public watch lists.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                GitHub Profile
              </label>
              <input
                type="text"
                value={github}
                onChange={e => setGithub(e.target.value)}
                onBlur={handleSocialsSave}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="https://github.com/username"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                LinkedIn Profile
              </label>
              <input
                type="text"
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                onBlur={handleSocialsSave}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="https://linkedin.com/in/username"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Twitter / X
              </label>
              <input
                type="text"
                value={twitter}
                onChange={e => setTwitter(e.target.value)}
                onBlur={handleSocialsSave}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="https://x.com/username"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 transition-colors font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">
                Portfolio / Personal Website
              </label>
              <input
                type="text"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                onBlur={handleSocialsSave}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="https://yourdomain.com"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 transition-colors font-mono"
              />
            </div>
          </div>
        </div>

        {/* Email notification preferences */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Email notifications
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Digest summaries when new jobs match the keywords on your watch lists.
              </p>
            </div>

            {approvalStatus !== 'approved' && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-semibold shrink-0 ${
                approvalStatus === 'unapproved'
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
              }`}>
                {approvalStatus === 'unapproved'
                  ? <><AlertTriangle className="w-3.5 h-3.5" /> Approval revoked</>
                  : <><Clock className="w-3.5 h-3.5" /> Awaiting approval</>}
              </span>
            )}
          </div>

          {/* Master switch */}
          <div className="flex items-center justify-between gap-6 py-5">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Email digests</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {approvalStatus === 'pending' && emailNotificationsEnabled
                  ? 'Your address is queued for admin approval before delivery begins.'
                  : 'Turn off to pause every digest email without losing your schedule.'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={emailNotificationsEnabled}
              aria-label="Email digests"
              onClick={handleToggleDigest}
              disabled={savingField === 'digest'}
              className={`w-11 h-6 rounded-full p-0.5 shrink-0 flex items-center transition-colors cursor-pointer disabled:opacity-50 ${
                emailNotificationsEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  emailNotificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Schedule */}
          <div className={`pt-5 border-t border-slate-200 dark:border-slate-800 transition-opacity ${
            emailNotificationsEnabled ? '' : 'opacity-50'
          }`}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Schedule
              </h3>

              <div className="flex items-center gap-2">
                {scheduleSaving && (
                  <span className="text-[11px] text-blue-500 font-medium">Saving…</span>
                )}
                {frequencyEnforcement?.isEnforced && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30 text-[11px] font-semibold">
                    <Lock className="w-3 h-3" /> Set by admin
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                <label htmlFor="digest-frequency" className="text-sm text-slate-600 dark:text-slate-400 sm:w-24 shrink-0">
                  Send me
                </label>
                <select
                  id="digest-frequency"
                  value={notificationPreference.startsWith('custom_') ? 'custom' : notificationPreference}
                  onChange={handleFrequencyChange}
                  disabled={frequencyEnforcement?.isEnforced || savingField === 'frequency'}
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {FREQUENCY_OPTIONS.filter(o => o.value !== 'custom').map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  <option value="custom">Custom interval…</option>
                </select>
              </div>

              {notificationPreference.startsWith('custom_') && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                  <label htmlFor="digest-custom-num" className="text-sm text-slate-600 dark:text-slate-400 sm:w-24 shrink-0">
                    Every
                  </label>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      id="digest-custom-num"
                      type="number"
                      min={1}
                      max={365}
                      value={parseCustomFrequency(notificationPreference).num}
                      onChange={e => {
                        const num = Math.min(365, Math.max(1, Number(e.target.value) || 1));
                        handleCustomFrequencyChange(num, parseCustomFrequency(notificationPreference).unit);
                      }}
                      disabled={frequencyEnforcement?.isEnforced || savingField === 'frequency'}
                      className="w-20 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 disabled:opacity-60"
                    />
                    <select
                      aria-label="Custom interval unit"
                      value={parseCustomFrequency(notificationPreference).unit}
                      onChange={e => handleCustomFrequencyChange(
                        parseCustomFrequency(notificationPreference).num,
                        e.target.value as 'hours' | 'days' | 'weeks',
                      )}
                      disabled={frequencyEnforcement?.isEnforced || savingField === 'frequency'}
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-60"
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Instant alerts fire on match, so a delivery time is meaningless there. */}
              {!isRealtimeSchedule && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                  <label htmlFor="digest-time" className="text-sm text-slate-600 dark:text-slate-400 sm:w-24 shrink-0">
                    At
                  </label>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      id="digest-time"
                      type="time"
                      step={900}
                      value={`${String(digestHour).padStart(2, '0')}:${String(digestMinute).padStart(2, '0')}`}
                      onChange={e => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        if (Number.isFinite(h) && Number.isFinite(m)) {
                          handleDigestTimeChange(h, Math.round(m / 15) * 15 % 60);
                        }
                      }}
                      disabled={timeEnforcedByAdmin || savingField === 'digestTime'}
                      className="w-32 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <select
                      aria-label="Timezone"
                      value={timezone}
                      onChange={e => handleTimezoneChange(e.target.value)}
                      disabled={savingField === 'timezone'}
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 cursor-pointer disabled:opacity-60"
                    >
                      {!timezoneOptions.current.includes(timezone) && (
                        <option value={timezone}>{timezone}</option>
                      )}
                      {timezoneOptions.current.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* One plain-language line, so the controls above do not need restating. */}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 sm:pl-28">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {describeDigestSchedule(notificationPreference, digestHour, digestMinute, timezone)}
              </span>
              {!isRealtimeSchedule && nextDigestAt && (
                <> · next on {new Date(nextDigestAt).toLocaleString(undefined, {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}</>
              )}
            </p>

            {!isRealtimeSchedule && detectedTimezone !== timezone && (
              <button
                type="button"
                onClick={() => handleTimezoneChange(detectedTimezone)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer mt-1.5 sm:ml-28"
              >
                Switch to {detectedTimezone}
              </button>
            )}

            {frequencyEnforcement?.isEnforced && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 sm:pl-28">
                Your administrator controls the digest frequency
                {timeEnforcedByAdmin && ' and delivery time'}. Your timezone still applies.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
