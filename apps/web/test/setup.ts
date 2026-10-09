import { testAppRoleUrl, testDatabaseUrl } from '@oda/db/testing';

// Runs in each test worker before each test file: server code talks to oda_test as the app's
// least-privilege role `oda_app` (rows only, like production: decision #93 D5); test clean-up
// (truncateAll) uses the owner. Better Auth gets a throwaway secret (never a real one).
process.env.ODA_TEST_OWNER_DATABASE_URL ??= testDatabaseUrl();
process.env.DATABASE_URL = testAppRoleUrl(process.env.ODA_TEST_OWNER_DATABASE_URL);
process.env.BETTER_AUTH_SECRET ??= 'test-only-secret-0123456789abcdefghijklmnop';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
// Emails stay in memory (server/email/transport.ts → testOutbox), never sent or written.
process.env.EMAIL_TRANSPORT = 'memory';
// Uploads go to a throwaway local folder (server/storage.ts, local driver).
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/oda-test-uploads-${process.pid}`;
