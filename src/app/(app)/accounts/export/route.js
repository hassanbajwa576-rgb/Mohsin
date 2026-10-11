import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { EXP_FROM } from '@/lib/queries';
import { FUNDS, STATUS_LABEL } from '@/lib/fmt';
import { toCsv, csvResponse } from '@/lib/csv';

export const dynamic = 'force-dynamic';

// Excel-ready CSV of one batch submitted to Accounts.
export async function GET(req) {
  await requireUser(['om', 'sso']);
  const id = Number(new URL(req.url).searchParams.get('batch'));
  if (!Number.isInteger(id)) return new Response('Bad batch', { status: 400 });
  const rows = await q(
    `SELECT to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, o.code AS office, e.category, e.description, e.fund, u.name AS submitter, e.amount, e.issue_id, e.status ${EXP_FROM} WHERE e.batch_id = $1 ORDER BY e.spent_on, e.id`,
    [id]
  );
  const header = ['Date', 'Office', 'Category', 'Description', 'Fund', 'Submitted by', 'Amount (PKR)', 'Advance #', 'Status'];
  const body = rows.map((r) => [r.spent_on, r.office, r.category, r.description, FUNDS[r.fund], r.submitter, r.amount, r.issue_id || '', STATUS_LABEL[r.status]]);
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  body.push(['', '', '', '', '', 'TOTAL', total, '', '']);
  return csvResponse(toCsv(header, body), 'pettytrack-batch-' + id + '.csv');
}
