import React, { useState } from 'react';
import { ExternalLink, MapPin, Calendar, Clock, DollarSign, Award, Building, Share2, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { getCompanyColorTheme, getCompanyLogoUrl } from '@/lib/utils/companyBranding';

interface JobCardProps {
  job: {
    id: string;
    title: string;
    url?: string | null;
    location?: string | null;
    jobType?: string | null;
    department?: string | null;
    rawData?: any;
    firstSeenAt?: string | Date;
  };
  companyIndex?: number;
}

function getSeniorityBadge(title: string, rawExp?: string | null) {
  const text = (title + ' ' + (rawExp || '')).toLowerCase();

  if (/\b(sr|senior|principal|staff|lead)\b/.test(text)) {
    if (/\b(lead|head|principal|staff)\b/.test(text)) {
      return { label: 'LEAD', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' };
    }
    return { label: 'SENIOR', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' };
  }
  if (/\b(jr|junior|associate)\b/.test(text)) {
    return { label: 'JUNIOR', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' };
  }
  if (/\b(manager|director|chief|vp)\b/.test(text)) {
    return { label: 'MANAGEMENT', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30' };
  }
  if (/\b(trainee|intern|internship|entry|fresh|graduate)\b/.test(text)) {
    return { label: 'ENTRY LEVEL', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
  }
  if (/\b(mid|intermediate)\b/.test(text)) {
    return { label: 'MID-LEVEL', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30' };
  }
  return null;
}

function parseDeadlineInfo(rawDeadline?: string | null): { text: string; isUrgent?: boolean; daysLeft?: number } | null {
  if (!rawDeadline) return null;
  const str = String(rawDeadline).trim();
  if (!str) return null;

  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) {
      return { text: str };
    }
    const diffMs = d.getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    if (daysLeft < 0) {
      return { text: `${formatted} (Expired)`, isUrgent: true, daysLeft: 0 };
    }
    if (daysLeft === 0) {
      return { text: `${formatted} (Today)`, isUrgent: true, daysLeft: 0 };
    }
    return {
      text: `${formatted} (${daysLeft}d left)`,
      daysLeft,
      isUrgent: daysLeft <= 7,
    };
  } catch {
    return { text: str };
  }
}

function cleanDeadlineValue(val?: string | null): string | null {
  if (!val) return null;
  let str = String(val).trim();
  if (!str) return null;
  if (/^posted/i.test(str) || /\bposted\b/i.test(str)) return null;
  return str.replace(/^(deadline|closing date|apply by|expires|last date|application deadline)\s*:?\s*/i, '').trim();
}

function cleanPostedDateValue(val?: string | null): string | null {
  if (!val) return null;
  let str = String(val).trim();
  if (!str) return null;
  if (/^deadline/i.test(str) || /\bdeadline\b/i.test(str)) return null;
  return str.replace(/^(posted|date posted|published|posted on)\s*:?\s*/i, '').trim();
}

export function JobCard({ job, companyIndex }: JobCardProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const raw = job.rawData || {};

  const company = (job as any).companyName || raw.company || null;
  const salary = raw.salary || null;
  const experience = raw.experience || null;
  const workplaceType = raw.workplaceType || null;
  
  const uncleanedDeadline = raw.deadline || raw.deadlineDate || raw.applyLastDate || raw.apply_last_date || raw.lastDateToApply || raw.last_date_to_apply || raw.closingDate || raw.closing_date || raw.expiresAt || raw.expiresOn || raw.validThrough || raw.expirationDate || raw.lastDate || raw.applyBy || raw.valid_through || raw.deadline_date || null;
  const rawDeadline = cleanDeadlineValue(uncleanedDeadline);

  const rawPostedStr = raw.postedDate || raw.postedAt || raw.posted_at || raw.datePosted || raw.date_posted || raw.publishedAt || raw.published_at || raw.created_at || raw.createdAt || raw.posted || null;
  const postedDate = cleanPostedDateValue(rawPostedStr);

  const description = raw.description || null;
  const jobType = job.jobType || raw.employmentType || 'Full-Time';

  const deadlineInfo = parseDeadlineInfo(rawDeadline);
  const seniority = getSeniorityBadge(job.title, experience);
  const colorTheme = getCompanyColorTheme(company || job.title, companyIndex);
  const logoUrl = getCompanyLogoUrl(job.url);

  const handleShareJob = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.url && typeof window !== 'undefined') {
      navigator.clipboard.writeText(job.url);
      setCopied(true);
      toast.success('Job application link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`group glass-card p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-200 space-y-3 relative border-l-4 ${colorTheme.border}`}
      style={{ backgroundColor: colorTheme.bgLight }}
    >
      {/* Top Header badges & Apply link */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {company && (
              <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 border ${colorTheme.badgeBg} ${colorTheme.text} ${colorTheme.badgeBorder}`}>
                {logoUrl ? (
                  <img src={logoUrl} alt={company} className="w-4 h-4 rounded object-contain shrink-0 bg-white p-0.5 border border-slate-200/50" />
                ) : (
                  <Building className="w-3.5 h-3.5 shrink-0" />
                )}
                {company}
              </span>
            )}

            {seniority && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${seniority.color}`}>
                {seniority.label}
              </span>
            )}

            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/8 border border-blue-500/20 px-2 py-0.5 rounded-md">
              {jobType}
            </span>

            {workplaceType && (
              <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-500/8 border border-purple-500/20 px-2 py-0.5 rounded-md">
                {workplaceType}
              </span>
            )}

            {job.department && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                • {job.department}
              </span>
            )}
          </div>

          <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight leading-snug">
            {job.title}
          </h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {job.url && (
            <button
              type="button"
              onClick={handleShareJob}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              title="Copy Job Link"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
          )}

          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl shadow-md hover:shadow-lg flex items-center gap-1.5 transition-all duration-200 cursor-pointer"
            >
              Apply <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Description Snippet if extracted */}
      {description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {description}
        </p>
      )}

      {/* Rich Metadata Chips Grid */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-600 dark:text-slate-400 font-medium">
        {job.location && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-rose-500" />
            <span>{job.location}</span>
          </div>
        )}

        {salary && (
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
            <DollarSign className="w-3.5 h-3.5" />
            <span>{salary}</span>
          </div>
        )}

        {experience && (
          <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-md">
            <Award className="w-3.5 h-3.5 text-amber-500" />
            <span>Experience: {experience}</span>
          </div>
        )}

        {postedDate && (
          <div className="flex items-center gap-1 text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Posted: {postedDate}</span>
          </div>
        )}

        {deadlineInfo ? (
          <div className={`flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md border ${
            deadlineInfo.isUrgent
              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
          }`}>
            <Calendar className="w-3.5 h-3.5" />
            <span>Deadline: {deadlineInfo.text}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-slate-500">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Deadline: Not Specified</span>
          </div>
        )}
      </div>
    </div>
  );
}
