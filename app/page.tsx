'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Briefcase, Eye, ShieldCheck, Zap, Globe, ArrowRight, Layers, Cpu, LayoutDashboard, ShieldAlert, PlusCircle, RefreshCw, Sliders, Mail, ChevronRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import { Footer } from '@/components/Footer';

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not logged in');
      })
      .then(data => {
        setUser(data.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setCheckingAuth(false);
      });
  }, []);

  const handleLogout = async () => {
    setUser(null);
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-200 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Logo />

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-400">
            <Link href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">How It Works</Link>
            <Link href="/discover" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Public Lists
            </Link>

            {user && (
              <Link href="/dashboard" className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1.5">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            )}

            {user?.role === 'admin' && (
              <Link href="/admin" className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-4 h-4" />
                Admin Panel
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            {!checkingAuth && (
              user ? (
                <UserProfileDropdown user={user} onLogout={handleLogout} />
              ) : (
                <Link
                  href="/login"
                  className="text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  Sign In
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-16 px-6 max-w-7xl mx-auto text-center relative">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border-blue-200 dark:border-blue-800/40 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-8">
          <Cpu className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          Powered by Cheerio, Greenhouse &amp; Lever ATS Engine
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl mx-auto leading-tight mb-8">
          Stop manual refreshing. <br />
          <span className="text-blue-600 dark:text-blue-400">
            Monitor company career pages automatically.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Create custom watch lists of target tech companies. JobPingly’s background workers automatically detect newly posted &amp; removed jobs, apply your keyword filters, and send daily digests.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            href={user ? "/dashboard" : "/login"}
            className="w-full sm:w-auto text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-3"
          >
            {user ? "Open Your Dashboard" : "Sign In to Get Started"}
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/discover"
            className="w-full sm:w-auto text-base font-semibold glass-panel text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-8 py-4 rounded-xl border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-2"
          >
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Explore Public Lists
          </Link>
        </div>

        {/* Dashboard Feature Preview Cards */}
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto text-left">
          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">Watch Lists</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Organize career pages by industry, tech stack, or region. Keep them private or publish to the community.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-4 font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">ATS Auto-Detection</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Native adapters for Greenhouse, Lever, plus Cheerio HTML fallback &amp; JSON-LD structured data parsing.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">Smart Daily Digest</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Deterministic keyword matching (e.g. Node.js, Frontend, Remote) sends only matching job alerts to your inbox.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-200 dark:border-slate-800/80">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            How JobPingly Works
          </h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto text-base md:text-lg">
            Never manually check career pages again. Add the sources you care about and let JobPingly do the rest.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto relative">
          {/* Desktop connecting line */}
          <div className="hidden md:block absolute top-10 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 dark:from-blue-900/30 dark:via-blue-500/40 dark:to-blue-900/30 -z-0" />

          {/* Step 1 */}
          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800 relative z-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-sm">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-900/50">
                  Step 01
                </span>
              </div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">Add Career Pages</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Add the company career pages you want to monitor.
              </p>
            </div>
            <div className="hidden md:flex absolute -right-3.5 top-10 -translate-y-1/2 w-7 h-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 items-center justify-center text-blue-500 dark:text-blue-400 shadow-sm z-20">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Step 2 */}
          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800 relative z-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-sm">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-900/50">
                  Step 02
                </span>
              </div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">Automatic Checking</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                JobPingly regularly checks those pages for new job postings.
              </p>
            </div>
            <div className="hidden md:flex absolute -right-3.5 top-10 -translate-y-1/2 w-7 h-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 items-center justify-center text-blue-500 dark:text-blue-400 shadow-sm z-20">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Step 3 */}
          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800 relative z-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-sm">
                  <Sliders className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-900/50">
                  Step 03
                </span>
              </div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">Smart Matching</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                New jobs are matched against your selected keywords and preferences.
              </p>
            </div>
            <div className="hidden md:flex absolute -right-3.5 top-10 -translate-y-1/2 w-7 h-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 items-center justify-center text-blue-500 dark:text-blue-400 shadow-sm z-20">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Step 4 */}
          <div className="glass-card p-6 rounded-2xl border-slate-200 dark:border-slate-800 relative z-10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold shadow-sm">
                  <Mail className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-900/50">
                  Step 04
                </span>
              </div>
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-2">Get Notified</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Receive an email when a relevant new opportunity is found.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Footer Component */}
      <Footer />
    </div>
  );
}

