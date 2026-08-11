'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Bug, Link2, Sparkles, HelpCircle, Send, Briefcase, UserCheck } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTargetUrl?: string;
}

export function ReportIssueModal({ isOpen, onClose, defaultTargetUrl = '' }: ReportIssueModalProps) {
  const toast = useToast();
  const [category, setCategory] = useState<'broken_url' | 'jobs_not_loading' | 'scraper_bug' | 'ui_bug' | 'feature_request' | 'general'>('jobs_not_loading');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState(defaultTargetUrl);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/me')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?.user) setCurrentUser(data.user);
        })
        .catch(() => setCurrentUser(null));
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const subjectInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => subjectInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          targetUrl: targetUrl.trim() || undefined,
          email: currentUser ? currentUser.email : (email.trim() || undefined),
          name: currentUser ? (currentUser.name || currentUser.email.split('@')[0]) : (name.trim() || undefined),
        }),
      });

      const json = await res.json();
      if (res.ok) {
        toast.success(json.message || 'Issue report submitted successfully!');
        setSubject('');
        setDescription('');
        setTargetUrl('');
        onClose();
      } else {
        toast.error(json.error || 'Failed to submit issue report.');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 cursor-default"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            Report an Issue or Feedback
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white text-xl font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          Spotted a broken career page URL, jobs not loading, or have feedback? Submit your report below and our engineering team will investigate.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { key: 'jobs_not_loading', label: 'Jobs Not Loading', icon: Briefcase },
                { key: 'broken_url', label: 'Broken URL', icon: Link2 },
                { key: 'scraper_bug', label: 'System Bug', icon: Bug },
                { key: 'ui_bug', label: 'UI Issue', icon: AlertCircle },
                { key: 'feature_request', label: 'Feature Request', icon: Sparkles },
                { key: 'general', label: 'General Feedback', icon: HelpCircle },
              ].map(cat => {
                const Icon = cat.icon;
                const isSelected = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key as any)}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {(category === 'broken_url' || category === 'scraper_bug' || category === 'jobs_not_loading') && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Problem Career Page URL (Optional)
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                placeholder="https://company.com/careers"
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-blue-600"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Subject *
            </label>
            <input
              ref={subjectInputRef}
              autoFocus
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Job extraction not picking up Greenhouse jobs on Stripe page"
              className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
              Detailed Description *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Provide exact details of what happened or what needs improvement..."
              className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* User Account Contact Info Section */}
          {currentUser ? (
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300">
              <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Submitting report as <strong className="font-bold">{currentUser.name || currentUser.email}</strong> ({currentUser.email})</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Your Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Submitting...' : 'Submit Issue Report'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
