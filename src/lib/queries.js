import 'server-only';
import { q } from './db';
import { FUNDS } from './fmt';

export const EXP_FROM = `FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id JOIN pc2_users u ON u.id = e.submitted_by`;
export const EXP_COLS = `e.id, e.fund, e.category, e.description, e.amount, e.status, e.submitted_by, e.issue_id, e.batch_id, e.decision_note, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, o.code AS office, u.name AS submitter`;

// Row-level scope: SOM and Sr. SO see both offices, a Support Officer sees only own entries.
export function expWhere(user, f = {}) {
  const c = [];
  const p = [];
  const add = (sql, v) => { p.push(v); c.push(sql.replace('?', '$' + p.length)); };
  if (user.role === 'so') add('e.submitted_by = ?', user.id);
  else if (f.office && f.office !== 'all') add('o.code = ?', f.office);
  if (f.status && f.status !== 'all') add('e.status = ?', f.status);
  if (f.fund && f.fund !== 'all') add('e.fund = ?', f.fund);
  if (f.month) add(`to_char(e.spent_on, 'YYYY-MM') = ?`, f.month);
  if (f.from) add('e.spent_on >= ?', f.from);
  if (f.to) add('e.spent_on <= ?', f.to);
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}

// Cash position per fund, optionally for a period {from, to} (YYYY-MM-DD).
//   Flows (received, spent, sent) count only what falls inside the period.
//   Balances (remaining, outstanding, where the cash sits) are cumulative up to the end of the period.
//   pool    = cash still with the Sr. Ops Manager
//   ssoCash = cash handed to the Sr. Support Officer and not yet spent or passed on
//   soCash  = cash with Support Officers (advances not yet spent or returned)
//   outstanding = received - sent   (advances not yet cleared with Accounts)
//   unsent      = spent - sent      (expenses made but not yet submitted to Accounts)
export async function fundSummary(opts = {}) {
  const to = opts.to || null;
  const from = opts.from || null;
  const [recv, iss, exp, ret] = await Promise.all([
    q(`SELECT a.fund, COALESCE(u.role, 'om') AS by_role, SUM(a.amount)::float8 AS cum, COALESCE(SUM(a.amount) FILTER (WHERE $2::date IS NULL OR a.received_on >= $2::date), 0)::float8 AS inrange FROM pc2_advances a LEFT JOIN pc2_users u ON u.id = a.created_by WHERE $1::date IS NULL OR a.received_on <= $1::date GROUP BY a.fund, COALESCE(u.role, 'om')`, [to, from]),
    q(`SELECT i.fund, h.role AS holder_role, b.role AS issuer_role, SUM(i.amount - i.returned)::float8 AS v FROM pc2_issues i JOIN pc2_users h ON h.id = i.issued_to JOIN pc2_users b ON b.id = i.issued_by WHERE $1::date IS NULL OR i.issued_on <= $1::date GROUP BY i.fund, h.role, b.role`, [to]),
    q(`SELECT e.fund, u.role AS role, SUM(e.amount)::float8 AS v, COALESCE(SUM(CASE WHEN e.status = 'sent' THEN e.amount END), 0)::float8 AS sent, COALESCE(SUM(e.amount) FILTER (WHERE $2::date IS NULL OR e.spent_on >= $2::date), 0)::float8 AS vin, COALESCE(SUM(CASE WHEN e.status = 'sent' THEN e.amount END) FILTER (WHERE $2::date IS NULL OR e.spent_on >= $2::date), 0)::float8 AS sentin FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by WHERE e.status <> 'rejected' AND ($1::date IS NULL OR e.spent_on <= $1::date) GROUP BY e.fund, u.role`, [to, from]),
    q(`SELECT r.fund, b.role AS by_role, SUM(r.amount)::float8 AS v, COALESCE(SUM(r.amount) FILTER (WHERE $2::date IS NULL OR r.returned_on >= $2::date), 0)::float8 AS inrange FROM pc2_returns r JOIN pc2_users b ON b.id = r.returned_by WHERE $1::date IS NULL OR r.returned_on <= $1::date GROUP BY r.fund, b.role`, [to, from]),
  ]);
  const sum = (rows, fund, test, f = 'v') => rows.filter((r) => r.fund === fund && test(r)).reduce((a, r) => a + Number(r[f]), 0);
  const rows = Object.keys(FUNDS).map((key) => {
    // Funds the Sr. SO recorded as received from Accounts stay with the Sr. SO; the rest is the Sr. OM's pool.
    const recvSso = sum(recv, key, (r) => r.by_role === 'sso', 'cum');
    const receivedCum = sum(recv, key, () => true, 'cum');
    const recvOm = receivedCum - recvSso;
    const received = sum(recv, key, () => true, 'inrange');
    const toSso = sum(iss, key, (r) => r.holder_role === 'sso');
    const soByOm = sum(iss, key, (r) => r.holder_role === 'so' && r.issuer_role !== 'sso');
    const soBySso = sum(iss, key, (r) => r.holder_role === 'so' && r.issuer_role === 'sso');
    const omExp = sum(exp, key, (r) => r.role === 'om');
    const ssoExp = sum(exp, key, (r) => r.role === 'sso');
    const soExp = sum(exp, key, (r) => r.role === 'so');
    // Cash handed back to Accounts: from the pool (Sr. OM) or from the Sr. SO's own cash.
    const retOm = sum(ret, key, (r) => r.by_role !== 'sso');
    const retSso = sum(ret, key, (r) => r.by_role === 'sso');
    const retCum = retOm + retSso;
    const returned = sum(ret, key, () => true, 'inrange');
    const spentCum = omExp + ssoExp + soExp;
    const sentCum = sum(exp, key, () => true, 'sent');
    const spent = sum(exp, key, () => true, 'vin');
    const sent = sum(exp, key, () => true, 'sentin');
    // If the Sr. SO has issued more than they hold, the difference came out of the pool.
    const ssoRaw = recvSso + toSso - soBySso - ssoExp - retSso;
    const pool = recvOm - toSso - soByOm - omExp - retOm + Math.min(0, ssoRaw);
    const ssoCash = Math.max(0, ssoRaw);
    const soCash = soByOm + soBySso - soExp;
    return {
      key, label: FUNDS[key], received, issued: toSso + soByOm, spent, sent,
      unsent: spentCum - sentCum, outstanding: receivedCum - sentCum - retCum, returned,
      pool, ssoCash, soCash, held: ssoCash + soCash, remaining: receivedCum - spentCum - retCum,
    };
  });
  const zero = { returned: 0, received: 0, issued: 0, spent: 0, sent: 0, unsent: 0, outstanding: 0, pool: 0, ssoCash: 0, soCash: 0, held: 0, remaining: 0 };
  const total = rows.reduce((a, r) => {
    const o = {};
    Object.keys(zero).forEach((k) => { o[k] = a[k] + r[k]; });
    return o;
  }, zero);
  return { rows, total };
}

// One Support Officer account: advances stay at their end until the expenses are submitted.
//   outstanding = advances - submitted expenses   (reduces only on submission)
//   cash        = advances - all expenses made so far
export async function soAccount(userId) {
  const r = await q(
    `SELECT COALESCE((SELECT SUM(amount - returned) FROM pc2_issues WHERE issued_to = $1), 0)::float8 AS advances, COALESCE((SELECT SUM(amount) FROM pc2_expenses WHERE submitted_by = $1 AND status <> 'rejected'), 0)::float8 AS spent, COALESCE((SELECT SUM(amount) FROM pc2_expenses WHERE submitted_by = $1 AND status IN ('submitted', 'verified', 'approved', 'sent')), 0)::float8 AS settled`,
    [userId]
  );
  const a = Number(r[0].advances);
  const spent = Number(r[0].spent);
  const settled = Number(r[0].settled);
  return { advances: a, spent, settled, draft: spent - settled, outstanding: a - settled, cash: a - spent };
}

// Cash one Sr. Support Officer currently holds in a fund: received from the SOM,
// minus what was passed on to Support Officers, minus what they spent themselves.
export async function custodyFor(userId, fund) {
  const r = await q(
    `SELECT COALESCE((SELECT SUM(amount - returned) FROM pc2_issues WHERE issued_to = $1 AND fund = $2), 0) + COALESCE((SELECT SUM(amount) FROM pc2_advances WHERE created_by = $1 AND fund = $2), 0) - COALESCE((SELECT SUM(amount - returned) FROM pc2_issues WHERE issued_by = $1 AND fund = $2), 0) - COALESCE((SELECT SUM(amount) FROM pc2_expenses WHERE submitted_by = $1 AND fund = $2 AND status <> 'rejected'), 0) - COALESCE((SELECT SUM(amount) FROM pc2_returns WHERE returned_by = $1 AND fund = $2), 0) AS v`,
    [userId, fund]
  );
  return Number(r[0].v);
}

// Advances issued to Support Officers, with what they have spent so far.
export async function issueRows(user) {
  const so = user.role === 'so';
  return q(
    `SELECT i.id, i.fund, i.amount, i.returned, i.note, i.issued_to, to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on, u.name AS holder, bu.name AS issuer, bu.role AS issuer_role, ho.code AS office, COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0)::float8 AS spent FROM pc2_issues i JOIN pc2_users u ON u.id = i.issued_to LEFT JOIN pc2_users bu ON bu.id = i.issued_by JOIN pc2_offices ho ON ho.id = u.office_id ${so ? 'WHERE i.issued_to = $1' : ''} ORDER BY i.id DESC LIMIT 200`,
    so ? [user.id] : []
  );
}

export async function unreadCount(userId) {
  const r = await q('SELECT count(*)::int AS n FROM pc2_notifications WHERE user_id = $1 AND NOT is_read', [userId]);
  return r[0].n;
}

// Expenses (not rejected) by fund and office for a period, for the fund x office tables.
export async function fundOfficeSpend({ from, to } = {}) {
  return q(
    `SELECT e.fund, o.code AS office, SUM(e.amount)::float8 AS amount FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.status <> 'rejected' AND ($1::date IS NULL OR e.spent_on >= $1::date) AND ($2::date IS NULL OR e.spent_on <= $2::date) GROUP BY e.fund, o.code`,
    [from || null, to || null]
  );
}

// Funds received from Accounts, by fund (not tied to an office).
export async function receivedByFund() {
  return q(`SELECT fund, 'All' AS office, SUM(amount)::float8 AS amount FROM pc2_advances GROUP BY fund`);
}

// Expenses still waiting for adjustment, by fund and stage (draft / review / ready), up to the end of a period.
export async function waitingByFund({ to } = {}) {
  return q(
    `SELECT e.fund, CASE WHEN e.status = 'draft' THEN 'draft' WHEN e.status = 'approved' THEN 'ready' ELSE 'review' END AS grp, u.role AS by_role, SUM(e.amount)::float8 AS v FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by WHERE e.status IN ('draft', 'submitted', 'verified', 'approved') AND ($1::date IS NULL OR e.spent_on <= $1::date) GROUP BY e.fund, 2, u.role`,
    [to || null]
  );
}
