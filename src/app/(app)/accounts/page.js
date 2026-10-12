import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { EXP_FROM, EXP_COLS } from '@/lib/queries';
import { submitToAccounts } from '@/lib/actions';
import { pkr } from '@/lib/fmt';
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
  const total = ready.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Accounts</h1>
          <p className='muted'>Expenses approved by the Operations Manager are submitted to the Accounts team in batches, by the Operations Manager or the Senior Support Officer. Support Officers cannot submit to Accounts.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <h2 style={{ marginTop: 0 }}>Ready to submit</h2>
      <div className='card'>
        <ExpenseTable rows={ready} user={user} back='/accounts' actions={false} />
        {ready.length ? (
          <p className='totals'>{ready.length} expenses - <b>{pkr(total)}</b></p>
        ) : null}
        {ready.length ? (
          <form action={submitToAccounts} className='form'>
            <label className='wide'>Note for Accounts<input name='note' placeholder='Optional, e.g. October petty cash settlement' /></label>
            <button className='btn primary' type='submit'>Submit to Accounts</button>
          </form>
        ) : null}
        
      </div>

      <h2>Submitted batches</h2>
      <div className='card'>
        {batches.length === 0 ? <p className='muted'>Nothing has been submitted to Accounts yet.</p> : (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>Batch</th><th>Submitted</th><th>By</th><th>Note</th><th className='r'>Expenses</th><th className='r'>Total</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td><b>#{b.id}</b></td>
                    <td className='nw'>{b.created}</td>
                    <td>{b.creator}</td>
                    <td>{b.note}</td>
                    <td className='r'>{b.item_count}</td>
                    <td className='r nw'><b>{pkr(b.total)}</b></td>
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
