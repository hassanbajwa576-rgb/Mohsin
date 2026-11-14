import 'server-only';
import { q } from './db';

export const DUTY_MIN = 8 * 60; // a full duty day
/** Duty minutes a day for people whose day is not the usual 8 hours (set on their Edit form): Map person id -> minutes. */
export async function dkDutyMap() {
  const r = await q(`SELECT key, value FROM pc2_hk_settings WHERE key LIKE 'dk\\_duty\\_%'`);
  const m = new Map();
  for (const x of r) {
    const id = Number(String(x.key).slice(8));
    const h = Number(x.value);
    if (Number.isInteger(id) && h >= 1 && h <= 24) m.set(id, Math.round(h * 60));
  }
  return m;
}

export const OT_BLOCK_H = 8; // every 8 overtime hours convert to 1 PTO day

/** Check-in / check-out text from the facial app ("06:58 AM" or "18:05") as minutes since midnight; null when unreadable. */
export function toMin(t) {
  const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  if (!m) return null;
  const h = m[3] ? (Number(m[1]) % 12) + (/p/i.test(m[3]) ? 12 : 0) : Number(m[1]);
  return h * 60 + Number(m[2]);
}

/** Duty minutes of one day: check out minus check in (a night shift that ends after midnight adds a day); null without a readable check out. */
export function dutyMin(ci, co) {
  const a = toMin(ci);
  const b = toMin(co);
  if (a == null || b == null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

export const hm = (min) => (min == null ? '-' : Math.floor(min / 60) + 'h ' + String(Math.round(min % 60)).padStart(2, '0') + 'm');

/** "09:05" (24-hour, from a time input) as "09:05 AM", the same text the facial app uses. */
export function fmt12(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  const h = Number(m[1]);
  return String((h % 12) || 12).padStart(2, '0') + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
}

/** Text like "09:05 AM" back to "09:05" for a time input. */
export function to24(t) {
  const n = toMin(t);
  return n == null ? '' : String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}

/** Every stored day of the active Dastarkhawan people in from..to (YYYY-MM-DD): facial-app times, with times typed in by hand taking over (or filling in) per field. */
export async function dkDayRows(from, to, personId = 0) {
  const r = await q(
    `WITH f AS (
       SELECT p.id AS pid, p.name, c.day, c.check_in, c.check_out, s.site, c.site AS app_site
         FROM pc2_dk_checkins c JOIN pc2_hk_people p ON p.dk_emp_id = c.emp_id AND p.active AND p.team = 'dast' LEFT JOIN pc2_dk_staff s ON s.emp_id = c.emp_id
        WHERE c.day >= $1::date AND c.day <= $2::date AND COALESCE(c.check_in, '') <> '' AND ($3::int = 0 OR p.id = $3::int)
     ), m AS (
       SELECT p.id AS pid, p.name, m.day, m.check_in, m.check_out, m.note, p.site
         FROM pc2_dk_manual m JOIN pc2_hk_people p ON p.id = m.person_id AND p.active AND p.team = 'dast'
        WHERE m.day >= $1::date AND m.day <= $2::date AND ($3::int = 0 OR p.id = $3::int)
     )
     SELECT COALESCE(f.pid, m.pid) AS person_id, COALESCE(f.name, m.name) AS name, to_char(COALESCE(f.day, m.day), 'YYYY-MM-DD') AS day,
            COALESCE(NULLIF(m.check_in, ''), f.check_in, '') AS check_in, COALESCE(NULLIF(m.check_out, ''), f.check_out, '') AS check_out,
            COALESCE(f.site, m.site, '') AS site, (m.pid IS NOT NULL) AS manual, m.note,
            COALESCE(f.check_in, '') AS app_in, COALESCE(f.check_out, '') AS app_out, COALESCE(f.app_site, '') AS app_site
       FROM f FULL JOIN m ON m.pid = f.pid AND m.day = f.day
      ORDER BY 2, 3`,
    [from, to, personId]
  );
  const duty = await dkDutyMap();
  return r.map((x) => ({ ...x, mins: dutyMin(x.check_in, x.check_out), duty: duty.get(x.person_id) || DUTY_MIN }));
}

/** Per person: overtime minutes of all stored days (duty above 8 hours), the hours already converted to PTO, and what is still available. */
export async function dkOvertime() {
  const rows = await dkDayRows('2000-01-01', '2100-01-01');
  const conv = await q(`SELECT person_id, COALESCE(SUM(hours), 0)::float8 AS hours FROM pc2_hk_ot_conv GROUP BY person_id`);
  const done = new Map(conv.map((c) => [c.person_id, c.hours]));
  const m = new Map();
  for (const x of rows) {
    if (x.mins == null) continue;
    m.set(x.person_id, (m.get(x.person_id) || 0) + Math.max(0, x.mins - x.duty));
  }
  const out = new Map();
  for (const id of new Set([...m.keys(), ...done.keys()])) {
    const earned = (m.get(id) || 0) / 60;
    const used = done.get(id) || 0;
    const left = Math.max(0, earned - used);
    out.set(id, { earned, used, left, days: Math.floor(left / OT_BLOCK_H + 1e-9) });
  }
  return out;
}
