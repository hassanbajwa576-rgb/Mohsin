import 'server-only';
import { q } from './db';

// Dates for tasks that repeat on a fixed day: every Friday, the 15th, or the last working day of the month
// (Monday to Friday, not a holiday on the holiday calendar).
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(s + 'T00:00:00Z');
const addD = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

async function lastWorking(y, m) {
  const first = iso(new Date(Date.UTC(y, m, 1)));
  let d = iso(new Date(Date.UTC(y, m + 1, 0)));
  const hol = new Set((await q(`SELECT to_char(day, 'YYYY-MM-DD') AS d FROM pc2_holidays WHERE day BETWEEN $1::date AND $2::date`, [first, d])).map((r) => r.d));
  for (let i = 0; i < 10; i++) {
    const wd = parse(d).getUTCDay();
    if (wd !== 0 && wd !== 6 && !hol.has(d)) return d;
    d = addD(d, -1);
  }
  return d;
}

export const FIXED_KINDS = ['friday', 'm15', 'mend'];

// The first matching date on or after `min`.
export async function fixedOnOrAfter(kind, min) {
  if (kind === 'friday') {
    let d = min;
    for (let i = 0; i < 7 && parse(d).getUTCDay() !== 5; i++) d = addD(d, 1);
    return d;
  }
  const base = parse(min);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const pick = async (yy, mm) => (kind === 'm15' ? iso(new Date(Date.UTC(yy, mm, 15))) : lastWorking(yy, mm));
  const a = await pick(y, m);
  if (a >= min) return a;
  return pick(m === 11 ? y + 1 : y, (m + 1) % 12);
}

// The next date after both the old due date and today.
export async function fixedNext(kind, due, today) {
  const from = due && due > today ? due : today;
  return fixedOnOrAfter(kind, addD(from, 1));
}
