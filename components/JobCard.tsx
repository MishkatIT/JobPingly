import React from 'react';
import { ExternalLink, MapPin, Calendar, Clock, DollarSign, Award, Building, Briefcase, Zap } from 'lucide-react';

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

export function JobCard({ job }: JobCardProps) {
  const raw = job.rawData || {};

  const company = (job as any).companyName || raw.company || null;
  const salary = raw.salary || null;
  const experience = raw.experience || null;
  const workplaceType = raw.workplaceType || null;
  const deadline = raw.deadline || raw.deadlineDate || null;
  const postedDate = raw.postedDate || null;
  const description = raw.description || null;
  const jobType = job.jobType || raw.employmentType || 'Full-Time';

  const seniority = getSeniorityBadge(job.title, experience);

  return (
    <div className="group glass-card p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-200 space-y-3 relative">
      {/* Top Header badges & Apply link */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {company && (
              <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-500" /> {company}
              </span>
            )}

            {seniority && (
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${seniority.color}`}>
                {seniority.label}
              </span>
            )}

            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
              {jobType}
            </span>

            {workplaceType && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
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

        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg flex items-center gap-1.5 shrink-0 transition-all duration-200 cursor-pointer opacity-100 sm:opacity-90 md:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 active:opacity-100 transform md:translate-x-1 md:group-hover:translate-x-0"
          >
            Apply <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
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

        {deadline && (
          <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-md">
            <Calendar className="w-3.5 h-3.5" />
            <span>Deadline: {deadline}</span>
          </div>
        )}
      </div>
    </div>
  );
}
