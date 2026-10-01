import { testDatabaseUrl } from '../src/testing';

// Runs in each test worker before the test file: every connection goes to oda_test.
process.env.DATABASE_URL = testDatabaseUrl();
