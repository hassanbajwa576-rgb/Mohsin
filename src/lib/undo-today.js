import { q } from './db';

const TODAY = (col) => `(${col} AT TIME ZONE 'Asia/Karachi')::date = (now() AT TIME ZONE 'Asia/Karachi')::date`;
const FIELDS = ['office', 'fund', 'category', 'description', 'amount', 'spent_on'];

// Everything the Sr. Ops Manager did to expenses today (Karachi date), worked out from the tables and the audit log:
// batches sent to Accounts, expenses approved or rejected, expenses added, and expenses edited.
export async function todayPlan(userId) {
  const [batches, created, decided, edits] = await Promise.all([
    q(`SELECT id, total::float8 AS total, item_count, note FROM pc2_batches WHERE created_by = $1 AND ${TODAY('created_at')} ORDER BY id`, [userId]),
    q(`SELECT e.id, e.amount::float8 AS amount, e.category, e.description, e.status, e.batch_id, e.fund, e.issue_id, e.spent_on::text AS spent_on, o.code AS office, e.submitted_by FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.submitted_by = $1 AND ${TODAY('e.created_at')} ORDER BY e.id`, [userId]),
    q(`SELECT e.id, e.amount::float8 AS amount, e.category, e.description, e.status, e.batch_id, o.code AS office FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.decided_by = $1 AND ${TODAY('e.decided_at')} AND NOT (e.submitted_by = $1 AND ${TODAY('e.created_at')}) ORDER BY e.id`, [userId]),
    q(`SELECT DISTINCT ON (entity_id) entity_id AS id, before FROM pc2_audit WHERE actor_id = $1 AND entity = 'expense' AND action = 'edit' AND entity_id IS NOT NULL AND ${TODAY('at')} ORDER BY entity_id, at, id`, [userId]),
  ]);
  const gone = new Set(created.map((r) => r.id));
  const editIds = edits.map((e) => e.id).filter((id) => !gone.has(id));
  const now = editIds.length
    ? await q(`SELECT e.id, o.code AS office, e.fund, e.category, e.description, e.amount::float8 AS amount, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.id = ANY($1::int[])`, [editIds])
    : [];
  const restore = [];
  for (const cur of now) {
    const before = (edits.find((e) => e.id === cur.id) || {}).before;
    if (!before) continue;
    const changes = FIELDS.filter((k) => before[k] !== undefined && String(before[k]) !== String(cur[k])).map((k) => ({ field: k, was: cur[k], back: before[k] }));
    if (changes.length) restore.push({ id: cur.id, category: cur.category, before, changes });
  }
  const sentIds = new Set([...created, ...decided].filter((r) => r.batch_id).map((r) => r.id));
  return { batches, created, decided, restore, sentIds: sentIds.size, empty: !batches.length && !created.length && !decided.length && !restore.length };
}
