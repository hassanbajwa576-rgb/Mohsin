import 'server-only';
import { q } from './db';
import { notifyRoles, notifyUser } from './notify';

export const CATS = [
  ['facilities', 'Facilities'],
  ['cleaning', 'Cleaning'],
  ['it', 'IT'],
  ['hr', 'HR'],
  ['vendor', 'Vendor'],
  ['visitor', 'Visitor'],
  ['safety', 'Safety'],
  ['transport', 'Transport'],
  ['other', 'Other'],
];
export const PRIOS = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
];
export const WHO = [
  ['staff', 'Staff member'],
  ['visitor', 'Visitor'],
  ['vendor', 'Vendor / supplier'],
  ['other', 'Other'],
];
export const CLABEL = Object.fromEntries(CATS);
export const PLABEL = Object.fromEntries(PRIOS);
export const WLABEL = Object.fromEntries(WHO);
// Days allowed to resolve a complaint when no due date is chosen.
export const DUE_DAYS = { urgent: 1, high: 2, medium: 5, low: 10 };

export const isMgr = (u) => u.role === 'om' || u.role === 'sso';
export const refOf = (id) => 'SC-' + String(id).padStart(4, '0');

export const C_COLS = `c.id, c.title, c.description, c.category, c.priority, c.status, c.location, c.complainant_type, c.complainant_name, c.complainant_phone,
  c.resolution, c.raised_by, c.assigned_to, c.office_id, o.code AS office, to_char(c.due_on, 'YYYY-MM-DD') AS due_on,
  (c.status = 'open' AND c.due_on < (now() AT TIME ZONE 'Asia/Karachi')::date) AS overdue,
  (extract(epoch from c.created_at) * 1000)::float8 AS created_ms, (extract(epoch from c.resolved_at) * 1000)::float8 AS resolved_ms,
  c.resp_hk_id, c.resp_user_id, c.resp_note, COALESCE(hp.name, ru.name) AS resp_name,
  rb.name AS raised_name, ab.name AS assigned_name, rs.name AS resolved_name`;
export const C_FROM = `FROM pc2_complaints c JOIN pc2_offices o ON o.id = c.office_id LEFT JOIN pc2_users rb ON rb.id = c.raised_by
  LEFT JOIN pc2_users ab ON ab.id = c.assigned_to LEFT JOIN pc2_users rs ON rs.id = c.resolved_by
  LEFT JOIN pc2_hk_people hp ON hp.id = c.resp_hk_id LEFT JOIN pc2_users ru ON ru.id = c.resp_user_id`;

/** Mohsin and Imran see every complaint; everyone else sees the ones they raised or that are assigned to them. */
export const canSee = (u, c) => isMgr(u) || c.raised_by === u.id || c.assigned_to === u.id;

function visibility(u, params) {
  if (isMgr(u)) return '';
  params.push(u.id);
  return '(c.raised_by = $' + params.length + ' OR c.assigned_to = $' + params.length + ')';
}

export async function complaintRows(u, { status, priority, category, office, text, limit = 300 } = {}) {
  const params = [];
  const cond = [visibility(u, params)].filter(Boolean);
  if (status === 'open' || status === 'resolved') {
    params.push(status);
    cond.push('c.status = $' + params.length);
  } else if (status === 'overdue') {
    cond.push("c.status = 'open' AND c.due_on < (now() AT TIME ZONE 'Asia/Karachi')::date");
  }
  if (PLABEL[priority]) {
    params.push(priority);
    cond.push('c.priority = $' + params.length);
  }
  if (CLABEL[category]) {
    params.push(category);
    cond.push('c.category = $' + params.length);
  }
  if (office === 'LHR' || office === 'ISB') {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (text) {
    params.push('%' + String(text).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%');
    cond.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length} OR c.location ILIKE $${params.length} OR c.complainant_name ILIKE $${params.length} OR hp.name ILIKE $${params.length} OR ru.name ILIKE $${params.length} OR ('SC-' || lpad(c.id::text, 4, '0')) ILIKE $${params.length})`);
  }
  return q(
    `SELECT ${C_COLS} ${C_FROM} ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
     ORDER BY (c.status = 'open') DESC, CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, c.due_on, c.id DESC LIMIT ${Number(limit) || 300}`,
    params
  );
}

export async function complaintById(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  return (await q(`SELECT ${C_COLS} ${C_FROM} WHERE c.id = $1`, [n]))[0] || null;
}

export async function filesOf(id) {
  return q('SELECT id, name, mime, size FROM pc2_complaint_files WHERE complaint_id = $1 ORDER BY id', [id]);
}

export async function notesOf(id) {
  return q(`SELECT n.id, n.note, n.kind, (extract(epoch from n.created_at) * 1000)::float8 AS at_ms, u.name FROM pc2_complaint_notes n LEFT JOIN pc2_users u ON u.id = n.user_id WHERE n.complaint_id = $1 ORDER BY n.id`, [id]);
}

/** The four counts shown at the top: open, overdue, high or urgent, resolved this month. */
export async function stats(u) {
  const params = [];
  const v = visibility(u, params);
  const r = await q(
    `SELECT COUNT(*) FILTER (WHERE c.status = 'open')::int AS open,
       COUNT(*) FILTER (WHERE c.status = 'open' AND c.due_on < (now() AT TIME ZONE 'Asia/Karachi')::date)::int AS overdue,
       COUNT(*) FILTER (WHERE c.status = 'open' AND c.priority IN ('urgent', 'high'))::int AS hot,
       COUNT(*) FILTER (WHERE c.status = 'resolved' AND c.resolved_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Karachi'))::int AS done
     FROM pc2_complaints c ${v ? 'WHERE ' + v : ''}`,
    params
  );
  return r[0];
}

/** Who complaints were tagged to as responsible: how many in total, still open and resolved. Mohsin and Imran only. */
export async function byPerson() {
  return q(`SELECT COALESCE(hp.name, ru.name) AS name, CASE WHEN c.resp_hk_id IS NOT NULL THEN 'Support team' ELSE 'OpsTrack user' END AS kind,
      COUNT(*)::int AS total, COUNT(*) FILTER (WHERE c.status = 'open')::int AS open, COUNT(*) FILTER (WHERE c.status = 'resolved')::int AS done,
      COUNT(*) FILTER (WHERE c.category = 'cleaning')::int AS cleaning, MAX(c.id) AS last_id
    FROM pc2_complaints c LEFT JOIN pc2_hk_people hp ON hp.id = c.resp_hk_id LEFT JOIN pc2_users ru ON ru.id = c.resp_user_id
    WHERE c.resp_hk_id IS NOT NULL OR c.resp_user_id IS NOT NULL GROUP BY 1, 2 ORDER BY total DESC, name`);
}

/** People a complaint can be assigned to. */
export async function assignees() {
  return q("SELECT id, name, role FROM pc2_users WHERE active AND role <> 'guard' ORDER BY (role = 'sso') DESC, (role = 'om') DESC, name");
}

/** Remind about overdue complaints once a day (whoever opens SupportTrack triggers it). Never fails the page. */
export async function remindOverdue() {
  try {
    const due = await q(`SELECT c.id, c.title, c.assigned_to FROM pc2_complaints c WHERE c.status = 'open' AND c.due_on < (now() AT TIME ZONE 'Asia/Karachi')::date AND (c.reminded_on IS NULL OR c.reminded_on < (now() AT TIME ZONE 'Asia/Karachi')::date) LIMIT 20`);
    for (const c of due) {
      await q("UPDATE pc2_complaints SET reminded_on = (now() AT TIME ZONE 'Asia/Karachi')::date WHERE id = $1", [c.id]);
      const msg = refOf(c.id) + ' is overdue: ' + c.title;
      if (c.assigned_to) await notifyUser(c.assigned_to, msg, '/support/view?id=' + c.id);
      await notifyRoles(['om'], msg, '/support/view?id=' + c.id, c.assigned_to || 0);
    }
  } catch {
    /* reminders are best effort */
  }
}
