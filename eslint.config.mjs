// Shared lint rules for the TypeScript packages in packages/*.
// apps/web and apps/seller have their own configs that extend their framework presets.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/migrations/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // shared and ui-tokens are bundled into the seller app: no database code.
    files: ['packages/shared/**', 'packages/ui-tokens/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['@oda/db', 'pg'],
          patterns: ['@oda/db/*', 'drizzle-orm', 'drizzle-orm/*'],
        },
      ],
    },
  },
);
