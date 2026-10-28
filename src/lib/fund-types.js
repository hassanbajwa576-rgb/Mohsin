import 'server-only';
import { q } from './db';
import { FUNDS } from './fmt';

// The advance types (Petty Cash, BRC, ...) live in the database so the Sr. Ops Manager can add more. FUNDS stays the one
// object every page reads; this refreshes it in place, at most every 10 seconds per server instance unless forced.
let loadedAt = 0;
export async function loadFunds(force) {
  if (!force && Date.now() - loadedAt < 10000) return;
  const rows = await q('SELECT key, label FROM pc2_fund_types ORDER BY sort, key');
  if (!rows.length) return;
  for (const k of Object.keys(FUNDS)) delete FUNDS[k];
  for (const r of rows) FUNDS[r.key] = r.label;
  loadedAt = Date.now();
}
