import React from 'react';
import { ExternalLink, MapPin, Calendar, Clock, DollarSign, Award, Building, Briefcase } from 'lucide-react';

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

export function JobCard({ job }: JobCardProps) {
  const raw = job.rawData || {};

  const company = raw.company || null;
  const salary = raw.salary || null;
  const experience = raw.experience || null;
  const workplaceType = raw.workplaceType || null;
  const deadline = raw.deadline || raw.deadlineDate || null;
  const postedDate = raw.postedDate || null;
  const description = raw.description || null;
  const jobType = job.jobType || raw.employmentType || 'Full-Time';

  return (
    <div className="glass-card p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-200 space-y-3">
      {/* Top Header badges & Apply link */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {company && (
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Building className="w-3 h-3 text-blue-500" /> {company}
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
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl shadow-md hover:shadow-lg flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
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
          <div className="flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-amber-500" />
            <span>{experience}</span>
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
