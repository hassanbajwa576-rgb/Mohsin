import 'server-only';
import { q } from './db';
import { FUNDS } from './fmt';

export const EXP_FROM = `FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id JOIN pc2_users u ON u.id = e.submitted_by`;
export const EXP_COLS = `e.id, e.fund, e.category, e.description, e.amount, e.status, e.submitted_by, e.decision_note, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, o.code AS office, u.name AS submitter`;

// Row-level scope: OM sees everything, SSO sees own office, SO sees only own entries.
export function expWhere(user, f = {}) {
  const c = [];
  const p = [];
  const add = (sql, v) => { p.push(v); c.push(sql.replace('?', '$' + p.length)); };
  if (user.role === 'so') add('e.submitted_by = ?', user.id);
  else if (user.role === 'sso') add('e.office_id = ?', user.office_id);
  else if (f.office && f.office !== 'all') add('o.code = ?', f.office);
  if (f.status && f.status !== 'all') add('e.status = ?', f.status);
  if (f.fund && f.fund !== 'all') add('e.fund = ?', f.fund);
  if (f.month) add(`to_char(e.spent_on, 'YYYY-MM') = ?`, f.month);
  return { where: c.length ? 'WHERE ' + c.join(' AND ') : '', params: p };
}

export async function fundBalances() {
  const [recv, spent] = await Promise.all([
    q(`SELECT fund, SUM(amount)::float8 AS total FROM pc2_advances GROUP BY fund`),
    q(`SELECT fund, COALESCE(SUM(CASE WHEN status = 'approved' THEN amount END), 0)::float8 AS spent, COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0)::float8 AS pending FROM pc2_expenses GROUP BY fund`),
  ]);
  const rows = Object.keys(FUNDS).map((key) => {
    const r = recv.find((x) => x.fund === key);
    const s = spent.find((x) => x.fund === key);
    const received = Number(r?.total || 0);
    const sp = Number(s?.spent || 0);
    const pending = Number(s?.pending || 0);
    return { key, label: FUNDS[key], received, spent: sp, pending, balance: received - sp };
  });
  const total = rows.reduce(
    (a, r) => ({ received: a.received + r.received, spent: a.spent + r.spent, pending: a.pending + r.pending, balance: a.balance + r.balance }),
    { received: 0, spent: 0, pending: 0, balance: 0 }
  );
  return { rows, total };
}
