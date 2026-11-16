/**
 * Tailwind theme for JobPingly.
 *
 * Colours are semantic and resolve to CSS variables defined in
 * app/globals.css, so light and dark themes share every class name. Use the
 * semantic names (bg-surface, text-muted, border-line, text-accent ...) in
 * components; do not reach for raw palette colours such as slate-500.
 *
 * @type {import('tailwindcss').Config}
 */
const token = name => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1.25rem', lg: '2rem' }, screens: { '2xl': '1200px' } },
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        sunken: token('sunken'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: token('ink'),
        muted: token('muted'),
        subtle: token('subtle'),
        primary: { DEFAULT: token('primary'), hover: token('primary-hover'), fg: token('primary-fg') },
        accent: { DEFAULT: token('accent'), hover: token('accent-hover'), soft: token('accent-soft'), fg: token('accent-fg') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft'), solid: token('danger-solid') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        md: ['1rem', { lineHeight: '1.625rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.5rem', { lineHeight: '2.75rem', letterSpacing: '-0.025em' }],
        '5xl': ['3.25rem', { lineHeight: '3.5rem', letterSpacing: '-0.03em' }],
        '6xl': ['4rem', { lineHeight: '4.25rem', letterSpacing: '-0.035em' }],
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '8px', lg: '10px', xl: '14px' },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(var(--shadow) / 0.05)',
        sm: '0 1px 2px 0 rgb(var(--shadow) / 0.06), 0 1px 3px 0 rgb(var(--shadow) / 0.05)',
        md: '0 4px 12px -2px rgb(var(--shadow) / 0.08), 0 2px 4px -2px rgb(var(--shadow) / 0.05)',
        pop: '0 12px 32px -8px rgb(var(--shadow) / 0.18), 0 0 0 1px rgb(var(--shadow) / 0.05)',
        focus: '0 0 0 3px rgb(var(--accent) / 0.25)',
      },
      maxWidth: { content: '1120px', prose: '68ch' },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.98)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        ping: { '75%, 100%': { transform: 'scale(2.2)', opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'rise-in': 'rise-in 180ms ease-out',
        'scale-in': 'scale-in 140ms ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
        ping: 'ping 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
