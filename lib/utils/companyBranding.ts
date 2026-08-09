export const COMPANY_COLOR_THEMES = [
  {
    name: 'blue',
    border: 'border-l-blue-500',
    borderHex: '#3b82f6',
    bgLight: 'rgba(59, 130, 246, 0.07)',
    borderLight: 'rgba(59, 130, 246, 0.3)',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    badgeBorder: 'border-blue-500/30',
    badgeBg: 'bg-blue-500/10',
  },
  {
    name: 'indigo',
    border: 'border-l-indigo-500',
    borderHex: '#6366f1',
    bgLight: 'rgba(99, 102, 241, 0.07)',
    borderLight: 'rgba(99, 102, 241, 0.3)',
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/20',
    text: 'text-indigo-600 dark:text-indigo-400',
    badgeBorder: 'border-indigo-500/30',
    badgeBg: 'bg-indigo-500/10',
  },
  {
    name: 'purple',
    border: 'border-l-purple-500',
    borderHex: '#a855f7',
    bgLight: 'rgba(168, 85, 247, 0.07)',
    borderLight: 'rgba(168, 85, 247, 0.3)',
    bg: 'bg-purple-500/10 dark:bg-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    badgeBorder: 'border-purple-500/30',
    badgeBg: 'bg-purple-500/10',
  },
  {
    name: 'pink',
    border: 'border-l-pink-500',
    borderHex: '#ec4899',
    bgLight: 'rgba(236, 72, 153, 0.07)',
    borderLight: 'rgba(236, 72, 153, 0.3)',
    bg: 'bg-pink-500/10 dark:bg-pink-500/20',
    text: 'text-pink-600 dark:text-pink-400',
    badgeBorder: 'border-pink-500/30',
    badgeBg: 'bg-pink-500/10',
  },
  {
    name: 'emerald',
    border: 'border-l-emerald-500',
    borderHex: '#10b981',
    bgLight: 'rgba(16, 185, 129, 0.07)',
    borderLight: 'rgba(16, 185, 129, 0.3)',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    badgeBorder: 'border-emerald-500/30',
    badgeBg: 'bg-emerald-500/10',
  },
  {
    name: 'teal',
    border: 'border-l-teal-500',
    borderHex: '#14b8a6',
    bgLight: 'rgba(20, 184, 166, 0.07)',
    borderLight: 'rgba(20, 184, 166, 0.3)',
    bg: 'bg-teal-500/10 dark:bg-teal-500/20',
    text: 'text-teal-600 dark:text-teal-400',
    badgeBorder: 'border-teal-500/30',
    badgeBg: 'bg-teal-500/10',
  },
  {
    name: 'amber',
    border: 'border-l-amber-500',
    borderHex: '#f59e0b',
    bgLight: 'rgba(245, 158, 11, 0.08)',
    borderLight: 'rgba(245, 158, 11, 0.3)',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'border-amber-500/30',
    badgeBg: 'bg-amber-500/10',
  },
  {
    name: 'rose',
    border: 'border-l-rose-500',
    borderHex: '#f43f5e',
    bgLight: 'rgba(244, 63, 94, 0.07)',
    borderLight: 'rgba(244, 63, 94, 0.3)',
    bg: 'bg-rose-500/10 dark:bg-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
    badgeBorder: 'border-rose-500/30',
    badgeBg: 'bg-rose-500/10',
  },
  {
    name: 'cyan',
    border: 'border-l-cyan-500',
    borderHex: '#06b6d4',
    bgLight: 'rgba(6, 182, 212, 0.07)',
    borderLight: 'rgba(6, 182, 212, 0.3)',
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    badgeBorder: 'border-cyan-500/30',
    badgeBg: 'bg-cyan-500/10',
  },
  {
    name: 'violet',
    border: 'border-l-violet-500',
    borderHex: '#8b5cf6',
    bgLight: 'rgba(139, 92, 246, 0.07)',
    borderLight: 'rgba(139, 92, 246, 0.3)',
    bg: 'bg-violet-500/10 dark:bg-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
    badgeBorder: 'border-violet-500/30',
    badgeBg: 'bg-violet-500/10',
  },
];

export function getCompanyColorTheme(name: string = '') {
  if (!name) return COMPANY_COLOR_THEMES[0];
  let hash = 0;
  const cleanStr = name.trim().toLowerCase();
  for (let i = 0; i < cleanStr.length; i++) {
    hash = cleanStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COMPANY_COLOR_THEMES.length;
  return COMPANY_COLOR_THEMES[index];
}

export function getCompanyLogoUrl(url?: string | null) {
  if (!url) return null;
  try {
    const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(formattedUrl);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return null;
  }
}
