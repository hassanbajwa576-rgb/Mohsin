import 'server-only';
import { q } from './db';

// Kinds of time off: [key, label, one letter for the grid, colour].
export const TYPES = [
  ['annual', 'Annual leave', 'A', '#cfe3fb'],
  ['sick', 'Sick leave', 'S', '#f9d3d3'],
  ['casual', 'Casual leave', 'C', '#fbeab5'],
  ['weekly', 'Weekly off', 'O', '#d3efdb'],
  ['unpaid', 'Unpaid leave', 'U', '#e0d9f3'],
  ['other', 'Other time off', 'X', '#e4e4e4'],
];export const TLABEL = Object.fromEntries(TYPES.map((t) => [t[0], t[1]]));
export const TINFO = Object.fromEntries(TYPES.map((t) => [t[0], { label: t[1], letter: t[2], color: t[3] }]));

export const addDays = (key, n) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
export const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

const COLS = `t.id, t.hk_id AS staff_id, t.kind, t.note, t.created_by, to_char(t.from_date, 'YYYY-MM-DD') AS from_date, to_char(t.to_date, 'YYYY-MM-DD') AS to_date,
  s.name, s.role AS dept, o.code AS office, u.name AS by_name`;
const FROM = `FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id JOIN pc2_offices o ON o.id = s.office_id LEFT JOIN pc2_users u ON u.id = t.created_by`;

/** Time off that touches the month, for the active housekeeping team, with optional office and name filters. */
export async function monthOff({ month, office, who }) {
  const first = month + '-01';
  const last = month + '-' + String(daysIn(month)).padStart(2, '0');
  const params = [first, last];
  const cond = ['s.active', 't.from_date <= $2::date', 't.to_date >= $1::date'];
  if (office) {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (who) {
    params.push('%' + String(who).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%');
    cond.push('s.name ILIKE $' + params.length);
  }
  return q(`SELECT ${COLS} ${FROM} WHERE ${cond.join(' AND ')} ORDER BY s.name, t.from_date`, params);
}

export async function offToday(day, office) {
  return q(`SELECT ${COLS} ${FROM} WHERE s.active AND t.from_date <= $1::date AND t.to_date >= $1::date ${office ? 'AND o.code = $2' : ''} ORDER BY s.name`, office ? [day, office] : [day]);
}

/** The housekeeping team (people who are not on the Employees list). */
export async function hkPeople({ office, who } = {}) {
  const params = [];
  const cond = ['s.active'];
  if (office) {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (who) {
    params.push('%' + String(who).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%');
    cond.push('s.name ILIKE $' + params.length);
  }
  return q(`SELECT s.id, s.name, s.role AS dept, o.code AS office FROM pc2_hk_people s JOIN pc2_offices o ON o.id = s.office_id WHERE ${cond.join(' AND ')} ORDER BY o.code, s.name`, params);
}
export const rosterStaff = hkPeople;