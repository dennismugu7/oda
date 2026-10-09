import { prepareTestDatabase } from '@oda/db/testing';

// Creates (if needed) and migrates the oda_test database once per test run, and sets up the
// app's least-privilege role there (server tests connect as it, decision #93 D5).
export default async function setup(): Promise<void> {
  await prepareTestDatabase(undefined, { appRole: true });
}
