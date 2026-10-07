// `pnpm db:seed`: builds the "Amani Styles" demo shop in the LOCAL database (after
// `pnpm db:reset`). Refuses any database that isn't on this machine.
import { existsSync } from 'node:fs';
import { getDb } from '../db';
import { seed } from './seed';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see apps/web/.env.example)');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error(`Refusing to seed ${host}: the seed is for the local database only`);
}
// The documented local default (.env.example) when .env.local doesn't set one.
const password = process.env.SEED_PASSWORD || 'oda-local-dev-2026';
if (password.length < 8) throw new Error('SEED_PASSWORD needs at least 8 characters');
// Sign-ups need a secret; a local throwaway one is fine for seeding.
process.env.BETTER_AUTH_SECRET ??= 'local-seed-only-secret-0123456789abcdef';

const summary = await seed(getDb(), { password });
console.log(
  `seed: ${summary.products} products, ${summary.orders} orders, ${summary.delivered} delivered, ` +
    `${summary.reviews} reviews (rating ${summary.rating})`,
);
console.log('seed: order numbers', summary.orderNumbers);
console.log('seed: sign in as amani@example.test with SEED_PASSWORD');
process.exit(0);
