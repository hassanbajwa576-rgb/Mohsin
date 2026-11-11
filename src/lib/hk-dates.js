import 'server-only';
import { q } from './db';
import { todayKey } from './att';

// Roster team members can be deactivated or re-activated with effect from a date (even a future one).
// Everything else only looks at the plain Active flag, so this flips it when the date arrives.
export async function applyHkDates() {
  try {
    const t = todayKey();
    await q('UPDATE pc2_hk_people SET active = FALSE, active_to = NULL WHERE active AND active_to IS NOT NULL AND active_to <= $1::date', [t]);
    await q('UPDATE pc2_hk_people SET active = TRUE, active_from = NULL, active_to = NULL WHERE NOT active AND active_from IS NOT NULL AND active_from <= $1::date', [t]);
  } catch {
    /* best effort: must never break a page */
  }
}
