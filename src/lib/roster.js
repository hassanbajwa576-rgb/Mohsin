import 'server-only';
import { q } from './db';

// Kinds of time off a person can be given: [key, label, letter in the grid, colour].
export const TYPES = [
  ['pto', 'PTO', 'P', '#cfe3fb'],
  ['ptom', 'PTO-M', 'PM', '#f9d3d3'],
  ['bereavement', 'Bereavement PTO', 'B', '#ddd6ee'],
  ['cpto', 'C-PTO', 'CP', '#d3efdb'],
  ['unpaid', 'Unpaid time off', 'U', '#fbeab5'],
  ['other', 'Other time off', 'X', '#e4e4e4'],
];
export const TLABEL = Object.fromEntries(TYPES.map((t) => [t[0], t[1]]));
// Kinds that have a yearly allowance.
export const ALLOWED = ['pto', 'ptom', 'bereavement', 'cpto'];
// Entries made before the types changed still display; they just cannot be chosen for new entries.
const OLD = { weekly: ['Weekly off', 'O', '#d3efdb'], annual: ['Annual time off', 'A', '#cfe3fb'], sick: ['Sick time off', 'S', '#f9d3d3'], casual: ['Casual time off', 'C', '#fbeab5'], wfh: ['Work from home', 'W', '#d3efdb'] };
export const TINFO = {
  ...Object.fromEntries(Object.entries(OLD).map(([k, v]) => [k, { label: v[0], letter: v[1], color: v[2] }])),
  ...Object.fromEntries(TYPES.map((t) => [t[0], { label: t[1], letter: t[2], color: t[3] }])),
};

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
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

const COLS = `t.id, t.hk_id AS staff_id, t.hours::float8 AS hours, t.status, t.kind, t.note, t.created_by, to_char(t.from_date, 'YYYY-MM-DD') AS from_date, to_char(t.to_date, 'YYYY-MM-DD') AS to_date,
  s.name, s.role AS dept, s.site, o.code AS office, u.name AS by_name, ru.name AS req_name`;
const FROM = `FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id LEFT JOIN pc2_offices o ON o.id = s.office_id LEFT JOIN pc2_users u ON u.id = t.created_by LEFT JOIN pc2_users ru ON ru.id = t.requested_by`;

// Adds the team (Support or Dastarkhawan), office and site filters to a query. `params` already holds the leading values.
function scope(params, cond, { office, team, site }) {
  params.push(team === 'dast' ? 'dast' : 'support');
  cond.push('s.team = $' + params.length);
  if (office) {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (site) {
    // Anyone mapped to the site (a person can be at several sites).
    params.push(site);
    cond.push('EXISTS (SELECT 1 FROM pc2_person_sites ps WHERE ps.person_id = s.id AND ps.site = $' + params.length + ')');
  }
}

/** Approved time off that touches the month, for the active people of one team, with optional office, site and name filters. */
export async function monthOff({ month, office, who, team = 'support', site = '' }) {
  const first = month + '-01';
  const last = month + '-' + String(daysIn(month)).padStart(2, '0');
  const params = [first, last];
  const cond = ["s.active", "t.status = 'approved'", 't.from_date <= $2::date', 't.to_date >= $1::date'];
  scope(params, cond, { office, team, site });
  if (who) {
    params.push('%' + String(who).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%');
    cond.push('s.name ILIKE $' + params.length);
  }
  return q(`SELECT ${COLS} ${FROM} WHERE ${cond.join(' AND ')} ORDER BY s.name, t.from_date`, params);
}

export async function offToday(day, office, team = 'support', site = '') {
  const params = [day];
  const cond = ['s.active', "t.status = 'approved'", 't.from_date <= $1::date', 't.to_date >= $1::date'];
  scope(params, cond, { office, team, site });
  return q(`SELECT ${COLS} ${FROM} WHERE ${cond.join(' AND ')} ORDER BY s.name`, params);
}

/** Approved time off in the next few days. */
export async function comingUp(from, days, office, team = 'support', site = '') {
  const params = [from, addDays(from, days)];
  const cond = ['s.active', "t.status = 'approved'", 't.from_date <= $2::date', 't.to_date >= $1::date'];
  scope(params, cond, { office, team, site });
  return q(`SELECT ${COLS} ${FROM} WHERE ${cond.join(' AND ')} ORDER BY t.from_date, s.name`, params);
}

export async function pendingRequests(office, team = 'support', site = '') {
  const params = [];
  const cond = ['s.active', "t.status = 'pending'"];
  scope(params, cond, { office, team, site });
  return q(`SELECT ${COLS} ${FROM} WHERE ${cond.join(' AND ')} ORDER BY t.from_date, s.name`, params);
}

/** The people of one team (they are not on the Employees list), with their details. */
export async function hkPeople({ office, who, team = 'support', site = '' } = {}) {
  const params = [];
  const cond = ['s.active'];
  scope(params, cond, { office, team, site });
  if (who) {
    params.push('%' + String(who).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%');
    cond.push('s.name ILIKE $' + params.length);
  }
  return q(
    `SELECT s.id, s.name, s.role AS dept, s.site, s.team, s.phone, to_char(s.joined_on, 'YYYY-MM-DD') AS joined_on, to_char(s.birthday, 'YYYY-MM-DD') AS birthday, o.code AS office,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('site', ps.site, 'days', ps.weekdays) ORDER BY ps.site), '[]'::jsonb) FROM pc2_person_sites ps WHERE ps.person_id = s.id) AS sites
     FROM pc2_hk_people s LEFT JOIN pc2_offices o ON o.id = s.office_id WHERE ${cond.join(' AND ')} ORDER BY o.code NULLS LAST, s.site, s.name`,
    params
  ).then((rows) => rows.map((r) => ({ ...r, sites: typeof r.sites === 'string' ? JSON.parse(r.sites) : r.sites || [] })));
}

/** The sites Dastarkhawan people can be at (managed on the Sites tab). */
export async function siteList() {
  const r = await q('SELECT name FROM pc2_sites WHERE active ORDER BY name');
  return r.map((x) => x.name);
}

/** Active sites with how many active Dastarkhawan people are at each. */
export async function siteCounts() {
  return q(`SELECT st.id, st.name, (SELECT COUNT(DISTINCT ps.person_id)::int FROM pc2_person_sites ps JOIN pc2_hk_people p ON p.id = ps.person_id WHERE p.active AND p.team = 'dast' AND ps.site = st.name) AS people FROM pc2_sites st WHERE st.active ORDER BY st.name`);
}
export const rosterStaff = hkPeople;

/** Birthdays in the next few days (by month and day). */
export function upcomingBirthdays(people, today, days) {
  const out = [];
  for (const p of people) {
    if (!p.birthday) continue;
    for (let i = 0; i <= days; i++) {
      const d = addDays(today, i);
      if (d.slice(5) === p.birthday.slice(5)) {
        out.push({ name: p.name, office: p.office, day: d, turns: Number(d.slice(0, 4)) - Number(p.birthday.slice(0, 4)) });
        break;
      }
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/* ---------- settings and holidays ---------- */

export const DEFAULTS = { pto: 0, ptom: 0, bereavement: 0, cpto: 0, hpd: 8, min_LHR: 0, min_ISB: 0 };

export async function getSettings() {
  const rows = await q('SELECT key, value FROM pc2_hk_settings');
  const s = { ...DEFAULTS };
  for (const r of rows) if (r.key in s && Number.isFinite(Number(r.value))) s[r.key] = Number(r.value);
  if (!(s.hpd > 0)) s.hpd = 8;
  return s;
}

/** Holidays between two dates as a Map of date -> name. */
export async function holidaysBetween(from, to) {
  const rows = await q(`SELECT to_char(day, 'YYYY-MM-DD') AS day, name FROM pc2_holidays WHERE day >= $1::date AND day <= $2::date ORDER BY day`, [from, to]);
  return new Map(rows.map((r) => [r.day, r.name]));
}

/** Days off used in a year, per person and kind. Holidays do not count; hours count as part of a day. */
export async function usedByPerson(year, office, team = 'support', site = '') {
  const first = year + '-01-01';
  const last = year + '-12-31';
  const params = [first, last];
  const cond = ['s.active', "t.status = 'approved'", 't.from_date <= $2::date', 't.to_date >= $1::date'];
  scope(params, cond, { office, team, site });
  const rows = await q(
    `SELECT t.hk_id, t.kind, t.hours::float8 AS hours, to_char(t.from_date, 'YYYY-MM-DD') AS f, to_char(t.to_date, 'YYYY-MM-DD') AS t2
     FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id LEFT JOIN pc2_offices o ON o.id = s.office_id
     WHERE ${cond.join(' AND ')}`,
    params
  );
  const hol = await holidaysBetween(first, last);
  const { hpd } = await getSettings();
  const used = new Map();
  for (const r of rows) {
    const u = used.get(r.hk_id) || {};
    const start = r.f < first ? first : r.f;
    const end = r.t2 > last ? last : r.t2;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (hol.has(d)) continue;
      u[r.kind] = (u[r.kind] || 0) + (r.hours != null ? r.hours / hpd : 1);
    }
    used.set(r.hk_id, u);
  }
  return used;
}