'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Globe, ArrowLeft, ExternalLink, Briefcase, ShieldAlert, Building, Share2, Check, Search } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import LoadingSpinner from '@/components/LoadingSpinner';
import { JobCard } from '@/components/JobCard';
import { Footer } from '@/components/Footer';

export default function PublicListPageView() {
  const params = useParams();
  const slug = params.slug as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/lists/${slug}`)
      .then(async res => {
        const text = await res.text();
        let json: any = {};
        try {
          json = JSON.parse(text);
        } catch {
          if (!res.ok) {
            throw new Error(res.status === 403 ? 'Public watch lists are currently disabled by administrator.' : 'Failed to connect to server.');
          }
        }
        if (!res.ok) {
          throw new Error(json.error || 'Public watch lists are currently disabled by administrator.');
        }
        return json;
      })
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Access disabled');
        setLoading(false);
      });
  }, [slug]);

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading public watch list..." fullPage />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] flex items-center justify-center p-6">
        <div className="glass-panel p-8 sm:p-12 rounded-3xl border-slate-200 dark:border-slate-800 text-center max-w-xl space-y-4">
          <ShieldAlert className="w-14 h-14 text-rose-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Access Disabled</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'This list may be private or does not exist.'}</p>
          <div className="pt-2">
            <Link href="/discover" className="inline-block text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md">
              Explore Public Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { list, pages, jobs } = data;

  const filteredPages = (pages || []).filter((p: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const companyName = (p.companyName || '').toLowerCase();
    const url = (p.url || '').toLowerCase();
    return companyName.includes(q) || url.includes(q);
  });

  const filteredJobs = (jobs || []).filter((j: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const title = (j.title || '').toLowerCase();
    const company = ((j.companyName || j.rawData?.company || '') as string).toLowerCase();
    const location = (j.location || '').toLowerCase();
    const department = (j.department || '').toLowerCase();
    const jobType = (j.jobType || j.rawData?.employmentType || '').toLowerCase();
    const experience = (j.rawData?.experience || '').toLowerCase();

    return (
      title.includes(q) ||
      company.includes(q) ||
      location.includes(q) ||
      department.includes(q) ||
      jobType.includes(q) ||
      experience.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080c14] text-slate-900 dark:text-slate-100 flex flex-col justify-between transition-colors">
      <Navbar showBackHome />
      <div className="p-6 md:p-12 max-w-6xl mx-auto w-full space-y-8 flex-1">

        {/* Header - Utilizing Right Side Space */}
        <div className="glass-panel p-8 rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <Globe className="w-3.5 h-3.5" /> Public Watch List
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">{list.name}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">{list.description || 'Public watch list of monitored company career pages.'}</p>
            <p className="text-xs text-slate-500 pt-1">Curated by: <span className="text-slate-800 dark:text-slate-300 font-semibold">{list.userName || 'Community User'}</span></p>
          </div>

          {/* Right Side Stats & Actions */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3 shrink-0">
            <div className="glass-card px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center min-w-[120px]">
              <div className="text-2xl font-black text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
                <Building className="w-5 h-5 text-blue-500" />
                {pages.length}
              </div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Companies</div>
            </div>

            <div className="glass-card px-5 py-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 text-center min-w-[120px]">
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5">
                <Briefcase className="w-5 h-5 text-blue-500" />
                {jobs.length}
              </div>
              <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mt-0.5">Active Jobs</div>
            </div>

            <button
              onClick={handleCopyLink}
              className="glass-card px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4 text-blue-500" />}
              {copied ? 'Copied!' : 'Share List'}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Companies List */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Monitored Companies ({filteredPages.length})</h2>
            {filteredPages.length === 0 ? (
              <div className="glass-panel p-6 rounded-2xl text-center border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                {searchQuery ? `No companies match "${searchQuery}"` : 'No monitored companies in this list.'}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPages.map((p: any) => (
                  <div key={p.id} className="glass-card p-4 rounded-xl border-slate-200 dark:border-slate-800 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white text-sm block mb-1">{p.companyName || 'Company'}</span>
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate block text-[11px] font-mono">
                      {p.url}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Jobs Feed */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Currently Open Positions ({filteredJobs.length})
              </h2>

              {/* Instant Search Bar (0 DB/Server Calls) */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search title, company, location..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600 transition-all shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>

            {filteredJobs.length === 0 ? (
              <div className="glass-panel p-10 rounded-2xl text-center border-slate-200 dark:border-slate-800 space-y-2">
                <Briefcase className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                {searchQuery ? (
                  <>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No jobs match "{searchQuery}"</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Try searching for a different title, company, or location.</p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline pt-1 cursor-pointer"
                    >
                      Clear Search Filter
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No active positions currently reported.</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.map((j: any) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
