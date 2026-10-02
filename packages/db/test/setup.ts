import { testDatabaseUrl } from '../src/testing';

// Runs in each test worker before the test file: every connection goes to oda_db_test.
process.env.DATABASE_URL = testDatabaseUrl('oda_db_test');
