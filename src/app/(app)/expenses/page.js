import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { addExpense } from '@/lib/actions';
import { pkr, today, FUNDS, CATEGORIES, STATUS_LABEL } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import Flash from '@/components/Flash';

export default async function ExpensesPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const f = {
    office: isOM ? sp.office || 'all' : user.office_code,
    status: sp.status || 'all',
    fund: sp.fund || 'all',
    month: sp.month || '',
  };
  const w = expWhere(user, f);
  const rows = await q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 300`, w.params);
  const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.amount), 0);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Expenses</h1>
          <p className='muted'>{isOM ? 'All offices' : user.role === 'sso' ? user.office_code + ' office' : 'Your submissions'}</p>
        </div>
      </div>
      <Flash sp={sp} />

      <details className='card' open>
        <summary>Add expense</summary>
        <form action={addExpense} className='form'>
          <label>Date<input type='date' name='spent_on' defaultValue={today()} required /></label>
          <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
          <label>Category
            <select name='category' required>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>Paid from
            <select name='fund' defaultValue='petty'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          {isOM ? (
            <label>Office
              <select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select>
            </label>
          ) : null}
          <label className='wide'>Description<input name='description' placeholder='What was it for?' /></label>
          <button className='btn primary' type='submit'>{isOM ? 'Record expense' : 'Submit for approval'}</button>
        </form>
      </details>

      <form method='get' className='card filters'>
        {isOM ? (
          <label>Office
            <select name='office' defaultValue={f.office}><option value='all'>Both</option><option>LHR</option><option>ISB</option></select>
          </label>
        ) : null}
        <label>Status
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
          Approved <b>{pkr(sum('approved'))}</b> - Pending <b>{pkr(sum('pending'))}</b> - Rejected <b>{pkr(sum('rejected'))}</b> ({rows.length} shown)
        </p>
      </div>
    </>
  );
}
