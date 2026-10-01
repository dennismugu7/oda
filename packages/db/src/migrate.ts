import { runMigrations } from './migrator';

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see packages/db/.env.example)');

await runMigrations(url);
console.log('migrations applied');
