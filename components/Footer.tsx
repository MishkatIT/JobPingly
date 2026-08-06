'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Github, Linkedin, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-[#080c14]/90 backdrop-blur-md py-8 px-6 sm:px-10 text-slate-600 dark:text-slate-400 text-xs sm:text-sm transition-colors mt-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo & Tagline */}
          <div className="space-y-1 text-center sm:text-left">
            <Logo />
            <p className="text-xs text-slate-500">
              Continuous career page monitoring &amp; automated ATS job alert infrastructure.
            </p>
          </div>

          {/* Quick Nav Links */}
          <div className="flex items-center gap-6 text-xs font-semibold text-slate-600 dark:text-slate-400 flex-wrap justify-center">
            <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Home</Link>
            <Link href="/discover" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Public Directory</Link>
            <Link href="/dashboard" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Dashboard</Link>
          </div>

          {/* Single Clean Social Icon Buttons (Md Mishkatul Islam) */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/MishkatIT"
              target="_blank"
              rel="noreferrer"
              aria-label="Md Mishkatul Islam GitHub"
              className="w-9 h-9 rounded-xl glass-card border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40 transition-all cursor-pointer shadow-sm"
              title="Md Mishkatul Islam GitHub"
            >
              <Github className="w-4 h-4" />
            </a>

            <a
              href="https://www.linkedin.com/in/miskat141"
              target="_blank"
              rel="noreferrer"
              aria-label="Md Mishkatul Islam LinkedIn"
              className="w-9 h-9 rounded-xl glass-card border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-500/40 transition-all cursor-pointer shadow-sm"
              title="Md Mishkatul Islam LinkedIn"
            >
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Developer Credit: Md Mishkatul Islam & Clean Copyright */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-medium">
            <span>Designed &amp; Developed with</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 animate-pulse" />
            <span>by <strong className="text-slate-900 dark:text-white font-bold">Md Mishkatul Islam</strong></span>
          </div>

          <div>
            <span>&copy; {new Date().getFullYear()} JobPingly. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
