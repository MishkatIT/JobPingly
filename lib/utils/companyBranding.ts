export const COMPANY_COLOR_THEMES = [
  {
    name: 'blue',
    border: 'border-l-blue-500',
    borderHex: '#3b82f6',
    bgLight: 'rgba(59, 130, 246, 0.05)',
    borderLight: 'rgba(59, 130, 246, 0.25)',
    bg: 'bg-blue-500/8 dark:bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    badgeBorder: 'border-blue-500/20',
    badgeBg: 'bg-blue-500/8',
  },
  {
    name: 'emerald',
    border: 'border-l-emerald-500',
    borderHex: '#10b981',
    bgLight: 'rgba(16, 185, 129, 0.05)',
    borderLight: 'rgba(16, 185, 129, 0.25)',
    bg: 'bg-emerald-500/8 dark:bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    badgeBorder: 'border-emerald-500/20',
    badgeBg: 'bg-emerald-500/8',
  },
  {
    name: 'purple',
    border: 'border-l-purple-500',
    borderHex: '#a855f7',
    bgLight: 'rgba(168, 85, 247, 0.05)',
    borderLight: 'rgba(168, 85, 247, 0.25)',
    bg: 'bg-purple-500/8 dark:bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    badgeBorder: 'border-purple-500/20',
    badgeBg: 'bg-purple-500/8',
  },
  {
    name: 'amber',
    border: 'border-l-amber-500',
    borderHex: '#f59e0b',
    bgLight: 'rgba(245, 158, 11, 0.05)',
    borderLight: 'rgba(245, 158, 11, 0.25)',
    bg: 'bg-amber-500/8 dark:bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'border-amber-500/20',
    badgeBg: 'bg-amber-500/8',
  },
  {
    name: 'rose',
    border: 'border-l-rose-500',
    borderHex: '#f43f5e',
    bgLight: 'rgba(244, 63, 94, 0.05)',
    borderLight: 'rgba(244, 63, 94, 0.25)',
    bg: 'bg-rose-500/8 dark:bg-rose-500/15',
    text: 'text-rose-600 dark:text-rose-400',
    badgeBorder: 'border-rose-500/20',
    badgeBg: 'bg-rose-500/8',
  },
  {
    name: 'teal',
    border: 'border-l-teal-500',
    borderHex: '#14b8a6',
    bgLight: 'rgba(20, 184, 166, 0.05)',
    borderLight: 'rgba(20, 184, 166, 0.25)',
    bg: 'bg-teal-500/8 dark:bg-teal-500/15',
    text: 'text-teal-600 dark:text-teal-400',
    badgeBorder: 'border-teal-500/20',
    badgeBg: 'bg-teal-500/8',
  },
  {
    name: 'indigo',
    border: 'border-l-indigo-500',
    borderHex: '#6366f1',
    bgLight: 'rgba(99, 102, 241, 0.05)',
    borderLight: 'rgba(99, 102, 241, 0.25)',
    bg: 'bg-indigo-500/8 dark:bg-indigo-500/15',
    text: 'text-indigo-600 dark:text-indigo-400',
    badgeBorder: 'border-indigo-500/20',
    badgeBg: 'bg-indigo-500/8',
  },
  {
    name: 'orange',
    border: 'border-l-orange-500',
    borderHex: '#f97316',
    bgLight: 'rgba(249, 115, 22, 0.05)',
    borderLight: 'rgba(249, 115, 22, 0.25)',
    bg: 'bg-orange-500/8 dark:bg-orange-500/15',
    text: 'text-orange-600 dark:text-orange-400',
    badgeBorder: 'border-orange-500/20',
    badgeBg: 'bg-orange-500/8',
  },
  {
    name: 'cyan',
    border: 'border-l-cyan-500',
    borderHex: '#06b6d4',
    bgLight: 'rgba(6, 182, 212, 0.05)',
    borderLight: 'rgba(6, 182, 212, 0.25)',
    bg: 'bg-cyan-500/8 dark:bg-cyan-500/15',
    text: 'text-cyan-600 dark:text-cyan-400',
    badgeBorder: 'border-cyan-500/20',
    badgeBg: 'bg-cyan-500/8',
  },
  {
    name: 'fuchsia',
    border: 'border-l-fuchsia-500',
    borderHex: '#d946ef',
    bgLight: 'rgba(217, 70, 239, 0.05)',
    borderLight: 'rgba(217, 70, 239, 0.25)',
    bg: 'bg-fuchsia-500/8 dark:bg-fuchsia-500/15',
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
    badgeBorder: 'border-fuchsia-500/20',
    badgeBg: 'bg-fuchsia-500/8',
  },
  {
    name: 'sky',
    border: 'border-l-sky-500',
    borderHex: '#0ea5e9',
    bgLight: 'rgba(14, 165, 233, 0.05)',
    borderLight: 'rgba(14, 165, 233, 0.25)',
    bg: 'bg-sky-500/8 dark:bg-sky-500/15',
    text: 'text-sky-600 dark:text-sky-400',
    badgeBorder: 'border-sky-500/20',
    badgeBg: 'bg-sky-500/8',
  },
  {
    name: 'violet',
    border: 'border-l-violet-500',
    borderHex: '#8b5cf6',
    bgLight: 'rgba(139, 92, 246, 0.05)',
    borderLight: 'rgba(139, 92, 246, 0.25)',
    bg: 'bg-violet-500/8 dark:bg-violet-500/15',
    text: 'text-violet-600 dark:text-violet-400',
    badgeBorder: 'border-violet-500/20',
    badgeBg: 'bg-violet-500/8',
  },
];

export function getCompanyColorTheme(name: string = '', indexOffset?: number) {
  let hash = 0;
  const cleanStr = (name || '').trim().toLowerCase();
  for (let i = 0; i < cleanStr.length; i++) {
    hash = cleanStr.charCodeAt(i) + ((hash << 5) - hash);
  }

  let index = Math.abs(hash);
  if (indexOffset !== undefined && indexOffset >= 0) {
    index = (index + indexOffset * 5); // Step by 5 to guarantee distinct palette contrast across consecutive list items
  }

  return COMPANY_COLOR_THEMES[index % COMPANY_COLOR_THEMES.length];
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
