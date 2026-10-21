import 'server-only';
import { q } from './db';
import { TZ } from './att';

export const VTYPES = [
  ['candidate', 'Candidate (interview)'],
  ['bank', 'Bank visit'],
  ['associate', 'Associate / partner'],
  ['client', 'Client'],
  ['vendor', 'Vendor / supplier'],
  ['delivery', 'Delivery / courier'],
  ['guest', 'Guest'],
  ['other', 'Other'],
];
export const VLABEL = Object.fromEntries(VTYPES);

export const V_COLS = `v.id, v.name, v.phone, v.company, v.vtype, v.host, v.purpose, v.badge, v.entered_by, v.out_by, o.code AS office, v.office_id,
  (extract(epoch from v.in_at) * 1000)::float8 AS in_ms, (extract(epoch from v.out_at) * 1000)::float8 AS out_ms, u.name AS by_name, (v.created_at > now() - interval '36 hours') AS fresh`;

// Who may change a visitor record: the Sr. Ops Manager, anyone with the visitor log access, and whoever checked the visitor in (for 36 hours).
export const canEditVisitor = (u, v) => u.role === 'om' || (Array.isArray(u.perms) && u.perms.includes('vis_log')) || u.role === 'sso' || (v.entered_by === u.id && v.fresh);
export const V_FROM = `FROM pc2_visitors v JOIN pc2_offices o ON o.id = v.office_id LEFT JOIN pc2_users u ON u.id = v.entered_by`;

/** Visitors who checked in between two dates (Karachi time), newest first. Optional office, type and a text search. */
export async function visitorRows({ from, to, office, vtype, text, openOnly }) {
  const cond = [`v.in_at >= (($1::date)::timestamp AT TIME ZONE '${TZ}') AND v.in_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')`];
  const params = [from, to];
  if (office) {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (vtype) {
    params.push(vtype);
    cond.push('v.vtype = $' + params.length);
  }
  if (text) {
    params.push('%' + String(text).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%');
    cond.push(`(v.name ILIKE $${params.length} OR v.company ILIKE $${params.length} OR v.host ILIKE $${params.length} OR v.phone ILIKE $${params.length})`);
  }
  if (openOnly) cond.push('v.out_at IS NULL');
  return q(`SELECT ${V_COLS} ${V_FROM} WHERE ${cond.join(' AND ')} ORDER BY v.in_at DESC, v.id DESC LIMIT 1000`, params);
}

/** Everyone still inside (checked in and not out yet), whatever day they came. */
export async function insideNow(office) {
  return q(`SELECT ${V_COLS} ${V_FROM} WHERE v.out_at IS NULL ${office ? 'AND o.code = $1' : ''} ORDER BY v.in_at`, office ? [office] : []);
}

/** Names of the employees (to pick who was met) from the staff list and the team. */
export async function hostNames(office) {
  const a = await q(`SELECT s.name FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ${office ? 'AND o.code = $1' : ''}`, office ? [office] : []);
  const b = await q('SELECT name FROM pc2_users WHERE active AND role <> \'guard\'');
  return [...new Set([...a, ...b].map((x) => x.name))].sort((x, y) => x.localeCompare(y));
}