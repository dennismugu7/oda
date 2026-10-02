import { testDatabaseUrl } from '@oda/db/testing';

// Runs in each test worker before the test file: server code talks to oda_test, and Better
// Auth gets a throwaway secret (never a real one).
process.env.DATABASE_URL = testDatabaseUrl();
process.env.BETTER_AUTH_SECRET ??= 'test-only-secret-0123456789abcdefghijklmnop';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
