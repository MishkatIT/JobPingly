'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Bell, User, CheckCircle2, Clock, AlertTriangle, Trash2, Camera, Check, Globe } from 'lucide-react';
import { useToast } from '@/components/Toast';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function SettingsPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [notificationPreference, setNotificationPreference] = useState('daily');
  const [approvalStatus, setApprovalStatus] = useState('pending');
  const [savingField, setSavingField] = useState<string | null>(null);

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
          setApprovalStatus(data.user.emailApprovalStatus || 'pending');

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
    socials?: { github?: string; linkedin?: string; twitter?: string; website?: string };
  }, fieldKey?: string) => {
    if (fieldKey) setSavingField(fieldKey);

    const updatedName = fields.name !== undefined ? fields.name : name;
    const updatedAvatarUrl = fields.avatarUrl !== undefined ? fields.avatarUrl : avatarUrl;
    const updatedEnabled = fields.emailNotificationsEnabled !== undefined ? fields.emailNotificationsEnabled : emailNotificationsEnabled;
    const updatedPref = fields.notificationPreference !== undefined ? fields.notificationPreference : notificationPreference;
    const updatedSocials = fields.socials !== undefined ? fields.socials : {
      github: github.trim(),
      linkedin: linkedin.trim(),
      twitter: twitter.trim(),
      website: website.trim(),
    };

    try {
      const res = await fetch('/api/me/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updatedName,
          avatarUrl: updatedAvatarUrl,
          emailNotificationsEnabled: updatedEnabled,
          notificationPreference: updatedPref,
          socials: updatedSocials,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.user?.emailApprovalStatus) {
          setApprovalStatus(data.user.emailApprovalStatus);
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
    setEmailNotificationsEnabled(next);
    const ok = await saveSetting({ emailNotificationsEnabled: next }, 'digest');
    if (ok) {
      toast.success(`Email digest alerts ${next ? 'enabled' : 'disabled'}`);
    }
  };

  const handleFrequencyChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextPref = e.target.value;
    setNotificationPreference(nextPref);
    const ok = await saveSetting({ notificationPreference: nextPref }, 'frequency');
    if (ok) {
      toast.success('Notification frequency updated!');
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
                onClick={handleToggleDigest}
                disabled={savingField === 'digest'}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all shrink-0 uppercase tracking-wider cursor-pointer disabled:opacity-50 ${
                  emailNotificationsEnabled
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-300'
                }`}
              >
                {savingField === 'digest' ? 'SAVING...' : (emailNotificationsEnabled ? 'ENABLED' : 'DISABLED')}
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Notification Frequency
                </label>
                {savingField === 'frequency' && (
                  <span className="text-[10px] text-blue-500 font-semibold animate-pulse">Saving...</span>
                )}
              </div>
              <select
                value={notificationPreference}
                onChange={handleFrequencyChange}
                disabled={savingField === 'frequency'}
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 font-medium transition-colors disabled:opacity-50"
              >
                <option value="daily">Daily Digest (Recommended - 8:00 AM summary)</option>
                <option value="instant">Instant Notification (Sends alert immediately upon update match)</option>
                <option value="weekly">Weekly Digest (Summary every Monday)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
