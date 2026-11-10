import 'server-only';
import { q } from './db';
import { todayKey } from './att';

// Employees can be set up beforehand: "active from" (a new joiner) and "deactivate with effect from" (a separation).
// Everything else in the app only looks at the plain Active flag, so this flips that flag when a date arrives.
export async function applyStaffDates() {
  try {
    const t = todayKey();
    await q('UPDATE pc2_staff SET active = FALSE, active_to = NULL WHERE active_to IS NOT NULL AND active_to <= $1::date', [t]);
    await q('UPDATE pc2_staff SET active = TRUE, active_from = NULL WHERE active_from IS NOT NULL AND active_from <= $1::date', [t]);
  } catch {
    /* best effort: must never break a page */
  }
}
