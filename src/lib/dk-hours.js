import 'server-only';
import { q } from './db';

export const DUTY_MIN = 8 * 60; // a full duty day
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

/** Every stored day of the active Dastarkhawan people (linked to the facial app) in from..to (YYYY-MM-DD). */
export async function dkDayRows(from, to, personId = 0) {
  const r = await q(
    `SELECT p.id AS person_id, p.name, to_char(c.day, 'YYYY-MM-DD') AS day, c.check_in, c.check_out, s.site
       FROM pc2_dk_checkins c JOIN pc2_hk_people p ON p.dk_emp_id = c.emp_id AND p.active AND p.team = 'dast' LEFT JOIN pc2_dk_staff s ON s.emp_id = c.emp_id
      WHERE c.day >= $1::date AND c.day <= $2::date AND COALESCE(c.check_in, '') <> '' AND ($3::int = 0 OR p.id = $3::int)
      ORDER BY p.name, c.day`,
    [from, to, personId]
  );
  return r.map((x) => ({ ...x, mins: dutyMin(x.check_in, x.check_out) }));
}

/** Per person: overtime minutes of all stored days (duty above 8 hours), the hours already converted to PTO, and what is still available. */
export async function dkOvertime() {
  const rows = await dkDayRows('2000-01-01', '2100-01-01');
  const conv = await q(`SELECT person_id, COALESCE(SUM(hours), 0)::float8 AS hours FROM pc2_hk_ot_conv GROUP BY person_id`);
  const done = new Map(conv.map((c) => [c.person_id, c.hours]));
  const m = new Map();
  for (const x of rows) {
    if (x.mins == null) continue;
    m.set(x.person_id, (m.get(x.person_id) || 0) + Math.max(0, x.mins - DUTY_MIN));
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
