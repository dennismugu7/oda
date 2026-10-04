import { testDatabaseUrl } from '@oda/db/testing';

// Runs in each test worker before the test file: server code talks to oda_test, and Better
// Auth gets a throwaway secret (never a real one).
process.env.DATABASE_URL = testDatabaseUrl();
process.env.BETTER_AUTH_SECRET ??= 'test-only-secret-0123456789abcdefghijklmnop';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
// Emails stay in memory (server/email/transport.ts → testOutbox), never sent or written.
process.env.EMAIL_TRANSPORT = 'memory';
// Uploads go to a throwaway local folder (server/storage.ts, local driver).
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/oda-test-uploads-${process.pid}`;
