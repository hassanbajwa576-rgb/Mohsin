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

// Cash position per fund.
//   pool    = cash still with the Operations Manager
//   ssoCash = cash handed to the Senior Support Officer and not yet spent or passed on
//   soCash  = cash with Support Officers (advances not yet spent or returned)
// Advances only clear once expenses are submitted to Accounts:
//   outstanding = received - sent   (what is still unsettled with Accounts)
//   unsent      = spent - sent      (expenses made but not yet submitted to Accounts)
export async function fundSummary() {
  const [recv, iss, exp] = await Promise.all([
    q(`SELECT fund, SUM(amount)::float8 AS v FROM pc2_advances GROUP BY fund`),
    q(`SELECT i.fund, h.role AS holder_role, b.role AS issuer_role, SUM(i.amount - i.returned)::float8 AS v FROM pc2_issues i JOIN pc2_users h ON h.id = i.issued_to JOIN pc2_users b ON b.id = i.issued_by GROUP BY i.fund, h.role, b.role`),
    q(`SELECT e.fund, u.role AS role, SUM(e.amount)::float8 AS v, COALESCE(SUM(CASE WHEN e.status = 'sent' THEN e.amount END), 0)::float8 AS sent FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by WHERE e.status <> 'rejected' GROUP BY e.fund, u.role`),
  ]);
  const sum = (rows, fund, test, f = 'v') => rows.filter((r) => r.fund === fund && test(r)).reduce((a, r) => a + Number(r[f]), 0);
  const rows = Object.keys(FUNDS).map((key) => {
    const received = sum(recv, key, () => true);
    const toSso = sum(iss, key, (r) => r.holder_role === 'sso');
    const soByOm = sum(iss, key, (r) => r.holder_role === 'so' && r.issuer_role !== 'sso');
    const soBySso = sum(iss, key, (r) => r.holder_role === 'so' && r.issuer_role === 'sso');
    const omExp = sum(exp, key, (r) => r.role === 'om');
    const ssoExp = sum(exp, key, (r) => r.role === 'sso');
    const soExp = sum(exp, key, (r) => r.role === 'so');
    const spent = omExp + ssoExp + soExp;
    const sent = sum(exp, key, () => true, 'sent');
    // If the SSO has issued more than they hold, the difference came out of the pool.
    const ssoRaw = toSso - soBySso - ssoExp;
    const pool = received - toSso - soByOm - omExp + Math.min(0, ssoRaw);
    const ssoCash = Math.max(0, ssoRaw);
    const soCash = soByOm + soBySso - soExp;
    return {
      key, label: FUNDS[key], received, issued: toSso + soByOm, spent, sent,
      unsent: spent - sent, outstanding: received - sent,
      pool, ssoCash, soCash, held: ssoCash + soCash, remaining: received - spent,
    };
  });
  const zero = { received: 0, issued: 0, spent: 0, sent: 0, unsent: 0, outstanding: 0, pool: 0, ssoCash: 0, soCash: 0, held: 0, remaining: 0 };
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

 in a fund: received from the OM,
// minus what was passed on to Support Officers, minus what they spent themselves.
export async function custodyFor(userId, fund) {
  const r = await q(
    `SELECT COALESCE((SELECT SUM(amount - returned) FROM pc2_issues WHERE issued_to = $1 AND fund = $2), 0) - COALESCE((SELECT SUM(amount - returned) FROM pc2_issues WHERE issued_by = $1 AND fund = $2), 0) - COALESCE((SELECT SUM(amount) FROM pc2_expenses WHERE submitted_by = $1 AND fund = $2 AND status <> 'rejected'), 0) AS v`,
    [userId, fund]
  );
  return Number(r[0].v);
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
