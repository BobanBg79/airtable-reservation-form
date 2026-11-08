// ESLint for everything except the mobile app: the Vercel functions (api/), the scripts, the database schema
// and packages/core. The mobile app has its own config (apps/mobile/eslint.config.js, Expo's React rules).
// Run `npm run lint` at the repo root: it checks both.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['apps/**', '**/node_modules/**', 'db/migrations/**', '**/dist/**', '**/.expo/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    // api/, scripts/ and the config files run on Node.
    files: ['api/**', 'scripts/**', 'db/**', '*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    // An unused argument or variable that starts with "_" is deliberate (for example `{ address: _address, ...rest }`).
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
]);
