// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// The app never talks to the database (CLAUDE.md): everything goes through the web API.
const noDatabase = 'The seller app uses the API, never the database.';

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'] },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@oda/db', message: noDatabase },
            { name: 'pg', message: noDatabase },
          ],
          patterns: [{ group: ['@oda/db/*', 'drizzle-orm', 'drizzle-orm/*'], message: noDatabase }],
        },
      ],
    },
  },
]);
