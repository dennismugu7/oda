import { prepareTestDatabase } from '../src/testing';

// Creates (if needed) and migrates the oda_test database once per test run.
export default async function setup(): Promise<void> {
  await prepareTestDatabase();
}
