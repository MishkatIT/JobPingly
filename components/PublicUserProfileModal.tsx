'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { User, Layers, Building, Briefcase, ExternalLink, Calendar, X, Globe } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface PublicUserProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

const formatSocialUrl = (url: string, type: 'github' | 'linkedin' | 'twitter' | 'website') => {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (type === 'github') return `https://github.com/${trimmed.replace(/^@/, '')}`;
  if (type === 'linkedin') return `https://linkedin.com/in/${trimmed.replace(/^@/, '')}`;
  if (type === 'twitter') return `https://x.com/${trimmed.replace(/^@/, '')}`;
  return `https://${trimmed}`;
};

import { Badge } from '@/components/Badge';

export function PublicUserProfileModal({ userId, onClose }: PublicUserProfileModalProps) {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError('');
    fetch(`/api/public/users/${userId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load user profile');
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load profile');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!userId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userId, onClose]);

  if (!userId || !mounted) return null;

  const socials = data?.user?.socials || {};
  const githubUrl = formatSocialUrl(socials.github, 'github');
  const linkedinUrl = formatSocialUrl(socials.linkedin, 'linkedin');
  const twitterUrl = formatSocialUrl(socials.twitter, 'twitter');
  const websiteUrl = formatSocialUrl(socials.website, 'website');
  const hasSocials = Boolean(githubUrl || linkedinUrl || twitterUrl || websiteUrl);

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150 cursor-default"
      >
        
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold p-1 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="py-12">
            <LoadingSpinner message="Loading user profile..." fullPage={false} />
          </div>
        ) : error ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm font-semibold text-rose-500">{error}</p>
            <button
              onClick={onClose}
              className="text-xs font-bold bg-slate-200 dark:bg-slate-800 px-4 py-2 rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : data ? (
          <div className="space-y-6">
            
            {/* Header User Card */}
            <div className="flex flex-col sm:flex-row items-center gap-5 pb-6 border-b border-slate-200 dark:border-slate-800">
              {data.user.avatarUrl ? (
                <img
                  src={data.user.avatarUrl}
                  alt={data.user.name || 'User'}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-600/30 shadow-md shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white font-extrabold text-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-600/20">
                  {(data.user.name?.[0] || 'U').toUpperCase()}
                </div>
              )}

              <div className="text-center sm:text-left space-y-1.5 flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {data.user.name || 'Community Member'}
                  </h2>
                  <Badge variant="curator">Curator</Badge>
                </div>

                {data.user.createdAt && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Member since {new Date(data.user.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </p>
                )}

                {/* Social Links Badges Bar */}
                {hasSocials && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                    {githubUrl && (
                      <a
                        href={githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        GitHub <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {linkedinUrl && (
                      <a
                        href={linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                      >
                        LinkedIn <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {twitterUrl && (
                      <a
                        href={twitterUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                      >
                        Twitter / X <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {websiteUrl && (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                      >
                        <Globe className="w-3 h-3" /> Website <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* User Statistics Row */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div className="glass-card p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Watch Lists</span>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{data.stats.totalLists}</span>
              </div>

              <div className="glass-card p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Companies</span>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{data.stats.totalCompanies}</span>
              </div>

              <div className="glass-card p-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-center">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">Active Jobs</span>
                <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-300">{data.stats.totalActiveJobs}</span>
              </div>
            </div>

            {/* Public Watch Lists Published by User */}
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                Published Watch Lists ({data.publicLists.length})
              </h3>

              {data.publicLists.length === 0 ? (
                <div className="glass-panel p-6 rounded-2xl text-center text-xs text-slate-500">
                  This user has not published any public watch lists yet.
                </div>
              ) : (
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                  {data.publicLists.map((l: any) => (
                    <div
                      key={l.id}
                      className="glass-card p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:border-blue-500/40 transition-all group"
                    >
                      <div className="space-y-1 max-w-[75%]">
                        <Link
                          href={`/lists/${l.slug}`}
                          onClick={onClose}
                          className="hover:underline decoration-blue-500/50 block"
                        >
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {l.name}
                          </h4>
                        </Link>
                        {l.description && l.description.trim() ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            {l.description.trim()}
                          </p>
                        ) : null}
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-medium">
                          <span>{l.companyCount || 0} Companies</span>
                          <span>&bull;</span>
                          <span className="text-blue-600 dark:text-blue-400 font-semibold">{l.jobCount || 0} Active Jobs</span>
                        </div>
                      </div>

                      <Link
                        href={`/lists/${l.slug}`}
                        onClick={onClose}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2 rounded-xl flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                      >
                        View <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
