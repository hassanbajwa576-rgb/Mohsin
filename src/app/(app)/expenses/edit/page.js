import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { editExpense } from '@/lib/actions';
import { FUNDS, CATEGORIES, STATUS_LABEL } from '@/lib/fmt';
import Flash from '@/components/Flash';

export default async function EditExpensePage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const id = Number(sp.id);
  const e = (await q(
    `SELECT e.id, o.code AS office, e.fund, e.category, e.description, e.amount, to_char(e.spent_on, 'YYYY-MM-DD') AS spent_on, e.status, e.issue_id, u.name AS submitter FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id JOIN pc2_users u ON u.id = e.submitted_by WHERE e.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!e) redirect('/expenses');
  const locked = e.status === 'sent';

  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit expense #{e.id}</h1>
          <p className='muted'>Submitted by {e.submitter} - stage: {STATUS_LABEL[e.status]}. Every change is recorded in the Logs.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        {locked ? (
          <p className='muted'>This expense was already sent to Accounts and can no longer be edited.</p>
        ) : (
          <form action={editExpense} className='form'>
            <input type='hidden' name='id' value={e.id} />
            <label>Date<input type='date' name='spent_on' defaultValue={e.spent_on} required /></label>
            <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' defaultValue={e.amount} required /></label>
            <label>Category
              <select name='category' defaultValue={e.category} required>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {e.issue_id ? (
              <label>Fund<input value={FUNDS[e.fund] + ' (set by advance #' + e.issue_id + ')'} disabled readOnly /></label>
            ) : (
              <label>Fund
                <select name='fund' defaultValue={e.fund}>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
            )}
            <label>Office
              <select name='office' defaultValue={e.office}><option>LHR</option><option>ISB</option></select>
            </label>
            <label className='wide'>Description<input name='description' defaultValue={e.description} /></label>
            <button className='btn primary' type='submit'>Save changes</button>
            <Link href='/expenses' className='btn ghost'>Cancel</Link>
          </form>
        )}
      </div>
    </>
  );
}
