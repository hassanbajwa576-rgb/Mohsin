import 'server-only';
import { q } from './db';
import { TZ } from './att';

export const FUEL_KINDS = [
  ['fill', 'Fuel filled'],
  ['topup', 'Card top-up'],
  ['opening', 'Opening balance'],
];
export const FKIND = Object.fromEntries(FUEL_KINDS);

/** The cards a person may see: Mohsin and Imran see all of them (null), anyone else only the cards given to them on Fuel Setup. */
export async function fuelScope(user) {
  if (user.role === 'om' || user.role === 'sso') return null;
  const r = await q('SELECT asset_id FROM pc2_fuel_access WHERE user_id = $1', [user.id]);
  return r.map((x) => x.asset_id);
}

/** Every active card with its balance (top-ups and opening balance minus fuel filled), the 30 day spend and the last movements. */
export async function cards(scope = null) {
  if (scope && !scope.length) return [];
  const rows = await q(
    `SELECT a.id, a.name, a.kind, a.low_at::float8 AS low_at,
       COALESCE(SUM(CASE WHEN t.kind IN ('topup', 'opening') THEN t.amount WHEN t.kind = 'fill' THEN -t.amount END), 0)::float8 AS balance,
       COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'fill' AND t.at >= now() - interval '30 days'), 0)::float8 AS spent30,
       (extract(epoch from MAX(t.at) FILTER (WHERE t.kind IN ('topup', 'opening'))) * 1000)::float8 AS topup_ms,
       (extract(epoch from MAX(t.at) FILTER (WHERE t.kind = 'fill')) * 1000)::float8 AS fill_ms,
       COUNT(t.id)::int AS n
     FROM pc2_fuel_assets a LEFT JOIN pc2_fuel_txn t ON t.asset_id = a.id
     WHERE a.active ${scope ? 'AND a.id = ANY($1::int[])' : ''} GROUP BY a.id ORDER BY a.sort, a.id`,
    scope ? [scope] : []
  );
  // At the pace of the last 30 days, how long the balance lasts.
  return rows.map((r) => ({ ...r, daysLeft: r.spent30 > 0 && r.balance > 0 ? Math.floor(r.balance / (r.spent30 / 30)) : null, low: r.n > 0 && r.balance < r.low_at }));
}

export const TXN_COLS = `t.id, t.asset_id, t.kind, t.amount::float8 AS amount, t.litres::float8 AS litres, t.reading::float8 AS reading, t.note, a.name AS asset,
  (extract(epoch from t.at) * 1000)::float8 AS at_ms, u.name AS by_name`;
export const TXN_FROM = `FROM pc2_fuel_txn t JOIN pc2_fuel_assets a ON a.id = t.asset_id LEFT JOIN pc2_users u ON u.id = t.created_by`;

export async function fuelRows({ from, to, asset, kind, scope = null, limit = 1000 }) {
  if (scope && !scope.length) return [];
  const params = [from, to];
  const cond = [`t.at >= (($1::date)::timestamp AT TIME ZONE '${TZ}')`, `t.at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')`];
  if (asset) {
    params.push(Number(asset));
    cond.push('t.asset_id = $' + params.length);
  }
  if (kind) {
    params.push(kind);
    cond.push('t.kind = $' + params.length);
  }
  if (scope) {
    params.push(scope);
    cond.push('t.asset_id = ANY($' + params.length + '::int[])');
  }
  return q(`SELECT ${TXN_COLS} ${TXN_FROM} WHERE ${cond.join(' AND ')} ORDER BY t.at DESC, t.id DESC LIMIT ${Number(limit) || 1000}`, params);
}

export async function recentFuel(n = 10, scope = null) {
  if (scope && !scope.length) return [];
  return q(`SELECT ${TXN_COLS} ${TXN_FROM} ${scope ? 'WHERE t.asset_id = ANY($1::int[])' : ''} ORDER BY t.at DESC, t.id DESC LIMIT ${Number(n) || 10}`, scope ? [scope] : []);
}