import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ROLE_LABEL } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

const DQ = String.fromCharCode(34);
const AP = String.fromCharCode(39);

// Quote every cell and neutralise spreadsheet formula injection.
function cell(v) {
  let s = String(v ?? '');
  if (['=', '+', '-', '@'].includes(s[0])) s = AP + s;
  return DQ + s.split(DQ).join(DQ + DQ) + DQ;
}

export async function GET() {
  await requireUser(['om']);
  const rows = await q(
    `SELECT u.name, u.role, o.code AS office, u.email, u.active, to_char(u.created_at, 'YYYY-MM-DD') AS created FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id ORDER BY CASE u.role WHEN 'om' THEN 0 WHEN 'sso' THEN 1 ELSE 2 END, u.name`
  );
  const header = ['Name', 'Role', 'Office', 'Login ID (email)', 'Status', 'Created'];
  const lines = [header.map(cell).join(',')].concat(
    rows.map((r) => [r.name, ROLE_LABEL[r.role], r.office, r.email, r.active ? 'Active' : 'Inactive', r.created].map(cell).join(','))
  );
  return new Response('\uFEFF' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=' + DQ + 'petty-cash-team.csv' + DQ,
      'Cache-Control': 'no-store',
    },
  });
}
