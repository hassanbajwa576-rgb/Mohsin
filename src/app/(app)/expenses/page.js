import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, issueRows, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { addExpense, submitDrafts } from '@/lib/actions';
import { pkr, today, FUNDS, CATEGORIES, STATUS_LABEL } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import Flash from '@/components/Flash';

export default async function ExpensesPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const isSO = user.role === 'so';
  const f = {
    office: isSO ? user.office_code : sp.office || 'all',
    status: sp.status || 'all',
    fund: sp.fund || 'all',
    month: sp.month || '',
  };
  const w = expWhere(user, f);
  const rows = await q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 300`, w.params);
  const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.amount), 0);
  const open = isSO
    ? (await issueRows(user)).map((i) => ({ ...i, left: i.amount - i.returned - Number(i.spent) })).filter((i) => i.left > 0)
    : [];
  const dq = isSO
    ? (await q(`SELECT COUNT(*)::int AS c, COALESCE(SUM(amount), 0)::float8 AS v FROM pc2_expenses WHERE submitted_by = $1 AND status = 'draft'`, [user.id]))[0]
    : null;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Expenses</h1>
          <p className='muted'>
            {isOM ? 'All offices - you review and submit to Accounts' : isSO ? 'Spend from your advances and submit them for adjustment' : 'Both offices - expenses are reviewed and approved by the Operations Manager'}
          </p>
        </div>
      </div>
      <Flash sp={sp} />

      {dq && dq.c > 0 ? (
        <form action={submitDrafts} className='card submitbar'>
          <div>
            <b>{dq.c} expense(s) - {pkr(dq.v)}</b> waiting to be submitted
            <div className='muted'>They stay with you (and in your advance) until you submit them to the SSO / Operations Manager.</div>
          </div>
          <button className='btn primary' type='submit'>Submit expenses</button>
        </form>
      ) : null}

      <details className='card' open>
        <summary>Add expense</summary>
        {isSO && open.length === 0 ? (
          <p className='muted'>You have no cash in hand. Ask the Senior Support Officer to issue you an advance first.</p>
        ) : (
          <form action={addExpense} className='form'>
            <label>Date<input type='date' name='spent_on' defaultValue={today()} required /></label>
            <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
            <label>Category
              <select name='category' required>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {isSO ? (
              <label>Paid from advance
                <select name='issue_id' required>
                  {open.map((i) => <option key={i.id} value={i.id}>{'#' + i.id + ' - ' + FUNDS[i.fund] + ' - in hand ' + pkr(i.left)}</option>)}
                </select>
              </label>
            ) : (
              <label>Paid from fund
                <select name='fund' defaultValue='petty'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
            )}
            {isOM ? (
              <label>Office
                <select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select>
              </label>
            ) : null}
            <label className='wide'>Description<input name='description' placeholder='What was it for?' /></label>
            <button className='btn primary' type='submit'>{isOM ? 'Record expense' : 'Add expense'}</button>
          </form>
        )}
      </details>

      <form method='get' className='card filters'>
        {!isSO ? (
          <label>Office
            <select name='office' defaultValue={f.office}><option value='all'>Both</option><option>LHR</option><option>ISB</option></select>
          </label>
        ) : null}
        <label>Stage
          <select name='status' defaultValue={f.status}>
            <option value='all'>All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Fund
          <select name='fund' defaultValue={f.fund}>
            <option value='all'>All</option>
            {Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Month<input type='month' name='month' defaultValue={f.month} /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/expenses' className='btn ghost'>Reset</Link>
      </form>

      <div className='card'>
        <ExpenseTable rows={rows} user={user} back='/expenses' />
        <p className='totals'>
          Not yet submitted <b>{pkr(sum('draft'))}</b> - Awaiting OM review <b>{pkr(sum('submitted') + sum('verified'))}</b> - Ready for Accounts <b>{pkr(sum('approved'))}</b> - Sent <b>{pkr(sum('sent'))}</b> ({rows.length} shown)
        </p>
      </div>
    </>
  );
}
