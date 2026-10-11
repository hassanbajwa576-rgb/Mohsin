import 'server-only';
import { q } from './db';
import { FUNDS } from './fmt';

export const EXP_FROM = `FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id JOIN pc2_users u ON u.id = e.submitted_by`;
export const EXP_COLS = `e.id, e.fund, e.category, e.description, e.amount, e.status, e.submitted_by, e.issue_id, e.batch_id, e.decision_note, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, o.code AS office, u.name AS submitter`;

// Row-level scope: OM and SSO see both offices, a Support Officer sees only own entries.
export function expWhere(user, f = {}) {
  const c = [];
  const p = [];
  const add = (sql, v) => { p.push(v); c.push(sql.replace('?', '$' + p.length)); };
  if (user.role === 'so') add('e.submitted_by = ?', user.id);
  else if (f.office && f.office !== 'all') add('o.code = ?', f.office);
  if (f.status && f.status !== 'all') add('e.status = ?', f.status);
  if (f.fund && f.fund !== 'all') add('e.fund = ?', f.fund);
  if (f.month) add(`to_char(e.spent_on, 'YYYY-MM') = ?`, f.month);
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}

// Cash position per fund. pool = cash still with the OM/SSO, held = cash with Support Officers.
export async function fundSummary() {
  const [recv, iss, exp] = await Promise.all([
    q(`SELECT fund, SUM(amount)::float8 AS v FROM pc2_advances GROUP BY fund`),
    q(`SELECT fund, SUM(amount - returned)::float8 AS v FROM pc2_issues GROUP BY fund`),
    q(`SELECT fund, COALESCE(SUM(CASE WHEN issue_id IS NULL THEN amount END), 0)::float8 AS direct, COALESCE(SUM(CASE WHEN issue_id IS NOT NULL THEN amount END), 0)::float8 AS viaissue FROM pc2_expenses WHERE status <> 'rejected' GROUP BY fund`),
  ]);
  const get = (rows, k, f = 'v') => Number(rows.find((x) => x.fund === k)?.[f] || 0);
  const rows = Object.keys(FUNDS).map((key) => {
    const received = get(recv, key);
    const issued = get(iss, key);
    const direct = get(exp, key, 'direct');
    const viaIssue = get(exp, key, 'viaissue');
    const spent = direct + viaIssue;
    return { key, label: FUNDS[key], received, issued, spent, pool: received - issued - direct, held: issued - viaIssue, remaining: received - spent };
  });
  const zero = { received: 0, issued: 0, spent: 0, pool: 0, held: 0, remaining: 0 };
  const total = rows.reduce((a, r) => ({
    received: a.received + r.received,
    issued: a.issued + r.issued,
    spent: a.spent + r.spent,
    pool: a.pool + r.pool,
    held: a.held + r.held,
    remaining: a.remaining + r.remaining,
  }), zero);
  return { rows, total };
}

// Advances issued to Support Officers, with what they have spent so far.
export async function issueRows(user) {
  const so = user.role === 'so';
  return q(
    `SELECT i.id, i.fund, i.amount, i.returned, i.note, i.issued_to, to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on, u.name AS holder, COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0)::float8 AS spent FROM pc2_issues i JOIN pc2_users u ON u.id = i.issued_to ${so ? 'WHERE i.issued_to = $1' : ''} ORDER BY i.id DESC LIMIT 200`,
    so ? [user.id] : []
  );
}

export async function unreadCount(userId) {
  const r = await q('SELECT count(*)::int AS n FROM pc2_notifications WHERE user_id = $1 AND NOT is_read', [userId]);
  return r[0].n;
}
