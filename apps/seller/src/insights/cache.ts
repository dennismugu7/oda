// The last Insights answer per period, so switching tabs (or going offline) shows it at once.
// Emptied on sign-out (src/settings/signOut.ts).
import type { InsightPeriod } from '@oda/shared';
import type { Insights } from './api';

const periods = new Map<InsightPeriod, Insights>();

export const insightsCache = {
  periods,
  clear: () => periods.clear(),
};
