import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { EXP_FROM, EXP_COLS } from '@/lib/queries';
import { submitToAccounts } from '@/lib/actions';
import { pkr, FUNDS, mergeSplits } from '@/lib/fmt';
import ReadySubmit from '@/components/ReadySubmit';
import ExpenseTable from '@/components/ExpenseTable';
import Flash from '@/components/Flash';

export default async function AccountsPage({ searchParams }) {
  const user = await requireUser(['om', 'sso']);
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const [ready, batches] = await Promise.all([
    q(`SELECT ${EXP_COLS} ${EXP_FROM} WHERE e.status = 'approved' AND e.batch_id IS NULL ORDER BY e.spent_on, e.id`),
    q(`SELECT b.id, b.total, b.item_count, b.note, to_char(b.created_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS created, u.name AS creator FROM pc2_batches b JOIN pc2_users u ON u.id = b.created_by ORDER BY b.id DESC LIMIT 100`),
  ]);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Accounts</h1>
          <p className='muted'>Expenses approved by the Sr. Ops Manager are submitted to the Accounts team in batches, by the Sr. Ops Manager or the Sr. Support Officer. Support Officers cannot submit to Accounts.</p>
        </div>
        {isOM ? <Link href='/accounts/undo' className='btn ghost'>Undo today's changes</Link> : null}
      </div>
      <Flash sp={sp} />

      <h2 style={{ marginTop: 0 }}>Ready to submit</h2>
      <div className='card'>
        {ready.length === 0 ? <p className='muted'>Nothing to show yet.</p> : (
          <ReadySubmit
            action={submitToAccounts}
            rows={mergeSplits(ready).map((r) => ({ id: r.id, ids: r.ids || [r.id], spent_on: r.spent_on, office: r.office, fund: FUNDS[r.fund], category: r.category, description: r.description, submitter: r.submitter, amount: Number(r.amount) }))}
          />
        )}
      </div>

      <h2>Submitted batches</h2>
      <div className='card'>
        {batches.length === 0 ? <p className='muted'>Nothing has been submitted to Accounts yet.</p> : (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Batch</th><th>Submitted</th><th>By</th><th>Note</th><th className='r'>Expenses</th><th className='r'>Total</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className='c-title'><b><span className='only-m'>Batch </span>#{b.id}</b></td>
                    <td className='nw c-meta'>{b.created}</td>
                    <td className='c-meta'>{b.creator}</td>
                    <td className='c-meta'>{b.note}</td>
                    <td className='r c-meta'>{b.item_count}<span className='only-m'> expenses</span></td>
                    <td className='r nw c-amt'><b>{pkr(b.total)}</b></td>
                    <td className='act'><a className='btn' href={'/accounts/export?batch=' + b.id}>Download Excel</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
