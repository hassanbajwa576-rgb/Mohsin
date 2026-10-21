import 'server-only';
import { q } from './db';

// Company policy: the same OPD limit for every Support team member, 1 January to 31 December, no carry forward.
export const OPD_LIMIT = 120000;

/** One row per Support team member with what they have availed in the year (limit and available follow the policy). */
export async function opdSummary(year, office) {
  const rows = await q(
    `SELECT s.id, s.name, s.role, o.code AS office, COALESCE(SUM(c.amount) FILTER (WHERE c.claim_date >= $1::date AND c.claim_date <= $2::date), 0)::float8 AS availed, COUNT(c.id) FILTER (WHERE c.claim_date >= $1::date AND c.claim_date <= $2::date)::int AS n
     FROM pc2_hk_people s JOIN pc2_offices o ON o.id = s.office_id LEFT JOIN pc2_hk_opd c ON c.hk_id = s.id
     WHERE s.active ${office ? 'AND o.code = $3' : ''} GROUP BY s.id, s.name, s.role, o.code ORDER BY o.code, s.name`,
    office ? [year + '-01-01', year + '-12-31', office] : [year + '-01-01', year + '-12-31']
  );
  return rows.map((r) => ({ ...r, limit: OPD_LIMIT, available: OPD_LIMIT - Number(r.availed) }));
}

export async function opdClaims(year, office) {
  return q(
    `SELECT c.id, c.hk_id, c.amount::float8 AS amount, c.note, to_char(c.claim_date, 'YYYY-MM-DD') AS claim_date, s.name, o.code AS office, u.name AS by_name
     FROM pc2_hk_opd c JOIN pc2_hk_people s ON s.id = c.hk_id JOIN pc2_offices o ON o.id = s.office_id LEFT JOIN pc2_users u ON u.id = c.created_by
     WHERE s.active AND c.claim_date >= $1::date AND c.claim_date <= $2::date ${office ? 'AND o.code = $3' : ''} ORDER BY c.claim_date DESC, c.id DESC`,
    office ? [year + '-01-01', year + '-12-31', office] : [year + '-01-01', year + '-12-31']
  );
}