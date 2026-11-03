import { q } from './db';

export const SHIFTS = { morning: 'Morning', evening: 'Evening', both: 'Morning and evening' };
export const PHOTO_KEEP_DAYS = 90;

// Photos are kept for 90 days after a relief guard's last duty, then deleted to keep the database small and the ID photos short-lived.
export async function prunePhotos() {
  await q(
    `DELETE FROM pc2_guard_photos p WHERE NOT EXISTS (SELECT 1 FROM pc2_guard_duty d WHERE d.guard_id = p.guard_id AND d.duty_to >= (now()::date - ${PHOTO_KEEP_DAYS}))`
  );
}

// One row per relief guard with the days and shifts they have worked (matched by CNIC).
export async function guardSummary() {
  return q(
    `SELECT g.id, g.name, g.mobile, g.cnic, g.card_no,
       COUNT(d.id)::int AS entries,
       COALESCE(SUM(d.duty_to - d.duty_from + 1), 0)::int AS days,
       COALESCE(SUM((d.duty_to - d.duty_from + 1) * CASE WHEN d.shift = 'both' THEN 2 ELSE 1 END), 0)::int AS shifts,
       to_char(MIN(d.duty_from), 'YYYY-MM-DD') AS first_on, to_char(MAX(d.duty_to), 'YYYY-MM-DD') AS last_on,
       EXISTS (SELECT 1 FROM pc2_guard_photos p WHERE p.guard_id = g.id AND p.kind = 'cnic') AS has_cnic,
       EXISTS (SELECT 1 FROM pc2_guard_photos p WHERE p.guard_id = g.id AND p.kind = 'guard') AS has_guard
     FROM pc2_relief_guards g LEFT JOIN pc2_guard_duty d ON d.guard_id = g.id
     GROUP BY g.id ORDER BY MAX(d.duty_to) DESC NULLS LAST, g.name`
  );
}

const DUTY_COLS = `d.id, d.guard_id, g.name, g.mobile, g.cnic, g.card_no, d.shift, d.handed_over_to, d.taken_over_from, d.note,
  to_char(d.duty_from, 'YYYY-MM-DD') AS duty_from, to_char(d.duty_to, 'YYYY-MM-DD') AS duty_to, (d.duty_to - d.duty_from + 1)::int AS days,
  u.name AS entered_by,
  EXISTS (SELECT 1 FROM pc2_guard_photos p WHERE p.guard_id = g.id AND p.kind = 'cnic') AS has_cnic,
  EXISTS (SELECT 1 FROM pc2_guard_photos p WHERE p.guard_id = g.id AND p.kind = 'guard') AS has_guard`;

export async function dutyRows(limit = 100) {
  return q(
    `SELECT ${DUTY_COLS} FROM pc2_guard_duty d JOIN pc2_relief_guards g ON g.id = d.guard_id LEFT JOIN pc2_users u ON u.id = d.created_by ORDER BY d.duty_from DESC, d.id DESC LIMIT ${Number(limit) || 100}`
  );
}

export async function dutyOne(id) {
  return (await q(`SELECT ${DUTY_COLS} FROM pc2_guard_duty d JOIN pc2_relief_guards g ON g.id = d.guard_id LEFT JOIN pc2_users u ON u.id = d.created_by WHERE d.id = $1`, [id]))[0];
}

// The regular guards (people with a login), offered as suggestions for who handed over to / took over from.
export async function regularGuardNames() {
  return (await q("SELECT name FROM pc2_users WHERE role = 'guard' AND active ORDER BY name")).map((r) => r.name);
}
