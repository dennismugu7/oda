import { prepareTestDatabase } from '../src/testing';

// Creates (if needed) and migrates oda_db_test once per run. It's separate from apps/web's
// oda_test because Turbo runs both packages' tests at the same time.
export default async function setup(): Promise<void> {
  await prepareTestDatabase('oda_db_test');
}
