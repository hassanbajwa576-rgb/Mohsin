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
  ['exemployee', 'Ex-Employee'],
  ['guest', 'Guest'],
  ['other', 'Other'],
];
// Tags the Sr. Ops Manager can put on a visitor record, as support for the guard.
export const OM_TAGS = [
  ['informed', 'Informed in WhatsApp by HR'],
  ['hr_missed', 'Not informed in WhatsApp by HR'],
];
export const OM_TAG_LABEL = Object.fromEntries(OM_TAGS);
export const VLABEL = Object.fromEntries(VTYPES);

export const V_COLS = `v.id, v.name, v.phone, v.company, v.vtype, v.host, v.purpose, v.remarks, v.om_tag, v.om_note, v.badge, v.entered_by, v.out_by, o.code AS office, v.office_id,
  (extract(epoch from v.in_at) * 1000)::float8 AS in_ms, (extract(epoch from v.out_at) * 1000)::float8 AS out_ms, u.name AS by_name, v.del_req_by, v.del_reason, (SELECT r.name FROM pc2_users r WHERE r.id = v.del_req_by) AS req_name, (v.created_at > now() - interval '36 hours') AS fresh`;

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

/** Delete requests waiting for the Sr. Ops Manager, whatever the date. */
export async function pendingDeletes() {
  return q(`SELECT ${V_COLS} ${V_FROM} WHERE v.del_req_by IS NOT NULL ORDER BY v.del_req_at`);
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

export const E_COLS = `e.id, e.name, e.phone, e.company, e.vtype, e.host, e.purpose, e.remarks, e.status, e.visitor_id, e.reschedule_of, o.code AS office, e.office_id,
  (extract(epoch from e.due_at) * 1000)::float8 AS due_ms, (extract(epoch from e.marked_at) * 1000)::float8 AS marked_ms,
  (SELECT c.name FROM pc2_users c WHERE c.id = e.created_by) AS by_name, (SELECT m.name FROM pc2_users m WHERE m.id = e.marked_by) AS marked_name`;
const E_FROM = 'FROM pc2_expected e JOIN pc2_offices o ON o.id = e.office_id';

/** The queue: announced visitors not yet arrived or marked, up to the end of the given day (earlier days still waiting stay on top). */
export async function waitingQueue(office, upToDay) {
  return q(`SELECT ${E_COLS} ${E_FROM} WHERE e.status = 'waiting' AND e.due_at < (($1::date + 1)::timestamp AT TIME ZONE '${TZ}') ${office ? 'AND o.code = $2' : ''} ORDER BY e.due_at`, office ? [upToDay, office] : [upToDay]);
}

/** Announced visitors for days after the given day, still waiting. */
export async function laterQueue(office, afterDay) {
  return q(`SELECT ${E_COLS} ${E_FROM} WHERE e.status = 'waiting' AND e.due_at >= (($1::date + 1)::timestamp AT TIME ZONE '${TZ}') ${office ? 'AND o.code = $2' : ''} ORDER BY e.due_at LIMIT 100`, office ? [afterDay, office] : [afterDay]);
}

/** No shows between two dates (Karachi time), newest first. */
export async function noShows({ from, to, office }) {
  const params = [from, to];
  if (office) params.push(office);
  return q(`SELECT ${E_COLS} ${E_FROM} WHERE e.status = 'noshow' AND e.due_at >= (($1::date)::timestamp AT TIME ZONE '${TZ}') AND e.due_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}') ${office ? 'AND o.code = $3' : ''} ORDER BY e.due_at DESC LIMIT 500`, params);
}

/** Whether a no-show already has a later reschedule waiting (so it is not rescheduled twice). */
export async function alreadyRescheduled(ids) {
  if (!ids.length) return new Set();
  const r = await q('SELECT DISTINCT reschedule_of FROM pc2_expected WHERE reschedule_of = ANY($1::int[])', [ids]);
  return new Set(r.map((x) => x.reschedule_of));
}

/**
 * The full trail for one expected-visitor entry: every time it was scheduled, no-showed and rescheduled, in order,
 * plus the actual visit (in/out time) if the latest entry in the chain led to an arrival.
 */
export async function visitHistory(id) {
  const up = await q(
    `WITH RECURSIVE up AS (
       SELECT id, reschedule_of, 0 AS d FROM pc2_expected WHERE id = $1
       UNION ALL
       SELECT e.id, e.reschedule_of, up.d + 1 FROM pc2_expected e JOIN up ON e.id = up.reschedule_of
     ) SELECT id FROM up ORDER BY d DESC LIMIT 1`,
    [id]
  );
  const root = up[0] ? up[0].id : id;
  const chain = await q(
    `WITH RECURSIVE down AS (
       SELECT e.id, e.reschedule_of, e.status, e.visitor_id, (extract(epoch from e.due_at) * 1000)::float8 AS due_ms,
         (extract(epoch from e.marked_at) * 1000)::float8 AS marked_ms, e.remarks,
         (SELECT m.name FROM pc2_users m WHERE m.id = e.marked_by) AS marked_name
       FROM pc2_expected e WHERE e.id = $1
       UNION ALL
       SELECT e.id, e.reschedule_of, e.status, e.visitor_id, (extract(epoch from e.due_at) * 1000)::float8,
         (extract(epoch from e.marked_at) * 1000)::float8, e.remarks,
         (SELECT m.name FROM pc2_users m WHERE m.id = e.marked_by)
       FROM pc2_expected e JOIN down ON e.reschedule_of = down.id
     ) SELECT * FROM down ORDER BY due_ms`,
    [root]
  );
  const visitorIds = chain.filter((c) => c.visitor_id).map((c) => c.visitor_id);
  const visits = visitorIds.length
    ? await q(
        `SELECT id, (extract(epoch from in_at) * 1000)::float8 AS in_ms, (extract(epoch from out_at) * 1000)::float8 AS out_ms FROM pc2_visitors WHERE id = ANY($1::int[])`,
        [visitorIds]
      )
    : [];
  const byVisitor = new Map(visits.map((v) => [v.id, v]));
  return chain.map((c) => ({ ...c, visit: c.visitor_id ? byVisitor.get(c.visitor_id) : null }));
}