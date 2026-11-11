import 'server-only';
import { q } from './db';

// Brings check-ins of the Dastarkhawan staff from the facial attendance app into OpsTrack.
// Reads two lists from that app: its staff directory and its daily attendance records. Nothing is written back to it.
const BASE = (process.env.DK_BASE_URL || 'https://dk-webapp-aqeag4axemewf0gc.canadacentral-01.azurewebsites.net').replace(/\/$/, '');
const FRESH_MS = 5 * 60 * 1000; // refresh at most every 5 minutes (when the Dastarkhawan page is opened)
const DAYS = 60; // how many days back are kept in sync

async function get(path) {
  // If the facial app is later protected with a key, set DK_API_KEY in Vercel and it is sent along.
  const headers = process.env.DK_API_KEY ? { Authorization: 'Bearer ' + process.env.DK_API_KEY } : {};
  const r = await fetch(BASE + path, { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(path + ' answered ' + r.status);
  return r.json();
}

const clean = (v) => String(v == null ? '' : v).trim();
const dayKey = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(d)) ? clean(d) : '');

/** Pull the latest staff and attendance from the facial app. Skipped when done in the last 5 minutes (unless forced). Never throws. */
export async function syncDk({ force = false } = {}) {
  try {
    const last = (await q('SELECT synced_at FROM pc2_dk_sync WHERE id = 1'))[0];
    if (!force && last && last.synced_at && Date.now() - new Date(last.synced_at).getTime() < FRESH_MS) return { skipped: true };

    const staff = (await get('/api/state/attendance_contractors?lite=1')).value || [];
    const att = (await get('/api/state/attendance_attendance?lite=1')).value || [];

    // One row per staff member / per person and day (the last one wins), so the insert never meets the same key twice.
    const s = [...new Map(staff.filter((x) => clean(x.id) && clean(x.name)).map((x) => [clean(x.id), x])).values()];
    if (s.length) {
      await q(
        `INSERT INTO pc2_dk_staff (emp_id, name, site, status) SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
         ON CONFLICT (emp_id) DO UPDATE SET name = EXCLUDED.name, site = EXCLUDED.site, status = EXCLUDED.status`,
        [s.map((x) => clean(x.id)), s.map((x) => clean(x.name)), s.map((x) => clean(x.site)), s.map((x) => (clean(x.status).toLowerCase() === 'inactive' ? 'inactive' : 'active'))]
      );
    }

    const from = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
    const a = [...new Map(att.filter((x) => clean(x.empId) && dayKey(x.date) && dayKey(x.date) >= from).map((x) => [clean(x.empId) + '|' + dayKey(x.date), x])).values()];
    if (a.length) {
      await q(
        `INSERT INTO pc2_dk_checkins (emp_id, day, check_in, check_out, status, method) SELECT e, d::date, ci, co, st, m FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]) AS t(e, d, ci, co, st, m)
         ON CONFLICT (emp_id, day) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, status = EXCLUDED.status, method = EXCLUDED.method`,
        [a.map((x) => clean(x.empId)), a.map((x) => dayKey(x.date)), a.map((x) => clean(x.checkIn)), a.map((x) => clean(x.checkOut)), a.map((x) => clean(x.status)), a.map((x) => clean(x.checkInMethod))]
      );
    }

    // Link people by name when the name is the same and the facial-app staff member is not linked yet.
    await q(
      `UPDATE pc2_hk_people p SET dk_emp_id = s.emp_id FROM pc2_dk_staff s
       WHERE p.team = 'dast' AND p.active AND p.dk_emp_id IS NULL AND s.status = 'active' AND lower(trim(p.name)) = lower(trim(s.name))
         AND NOT EXISTS (SELECT 1 FROM pc2_hk_people p2 WHERE p2.active AND p2.dk_emp_id = s.emp_id)`
    );
    await q(`INSERT INTO pc2_dk_sync (id, synced_at, error, rows) VALUES (1, now(), NULL, $1) ON CONFLICT (id) DO UPDATE SET synced_at = now(), error = NULL, rows = EXCLUDED.rows`, [a.length]);
    return { ok: true, staff: s.length, records: a.length };
  } catch (e) {
    // Try again in about a minute; the page keeps working with what is already stored.
    try {
      await q(`INSERT INTO pc2_dk_sync (id, synced_at, error) VALUES (1, now() - interval '4 minutes', $1) ON CONFLICT (id) DO UPDATE SET synced_at = now() - interval '4 minutes', error = EXCLUDED.error`, [String(e.message || e).slice(0, 200)]);
    } catch {}
    return { error: String(e.message || e) };
  }
}

/** When the last good sync was, and the last error (if the latest try failed). */
export async function dkStatus() {
  const r = (await q(`SELECT to_char(synced_at AT TIME ZONE 'Asia/Karachi', 'DD Mon, HH12:MI AM') AS at, error FROM pc2_dk_sync WHERE id = 1`))[0];
  return r || { at: '', error: '' };
}
