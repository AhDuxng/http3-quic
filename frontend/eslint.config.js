/**
 * eslint.config.js - Cau hinh ESLint cho frontend (flat config - ESLint v9+).
 *
 * Ap dung cho ca .js, .jsx, .ts, .tsx.
 * Bao gom: JS recommended, React Hooks rules, React Refresh rules.
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Bo qua thu muc build output
  globalIgnores(['dist']),
  {
    // Lint ca JS/JSX va TS/TSX
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,  // Kiem tra rules cua React Hooks
      reactRefresh.configs.vite,             // Ho tro HMR voi React Refresh
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Cho phep bien viet hoa (thuong la hang so) du chua dung
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
