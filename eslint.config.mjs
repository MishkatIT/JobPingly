import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts', 'coverage/**'],
  },
  {
    rules: {
      // The codebase talks to many loosely typed third-party payloads (ATS
      // APIs, scraped JSON). `any` is tolerated there but flagged.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@next/next/no-img-element': 'off',
    },
  },
  {
    // Plain Node.js entry points (CommonJS by design: they run before any build step).
    files: ['scripts/**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Tests are not React code; helpers such as useFakeDns are not hooks.
    files: ['tests/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
];

export default config;
