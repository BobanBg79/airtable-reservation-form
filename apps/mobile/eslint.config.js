// ESLint for the mobile app: Expo's recommended flat config (React, React Hooks, React Native rules, TypeScript).
// Run with `npm run lint` (from the repo root or from apps/mobile).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([expoConfig, { ignores: ['dist/*', '.expo/*'] }]);
