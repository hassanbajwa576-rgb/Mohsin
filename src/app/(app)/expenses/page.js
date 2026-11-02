import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, issueRows, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { addExpense, addExpensesBulk, approveAll, deleteExpensesBulk, submitDrafts } from '@/lib/actions';
import BulkApprove from '@/components/BulkApprove';
import { pkr, today, FUNDS, CATEGORIES, STATUS_LABEL } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import PasteExpenses from '@/components/PasteExpenses';
import SoExpenseForm from '@/components/SoExpenseForm';
import { mergeSplits } from '@/lib/fmt';
import FundMatrix, { buildMatrix } from '@/components/FundMatrix';
import ExpenseInsights from '@/components/ExpenseInsights';
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
    q: (sp.q || '').trim().slice(0, 60),
  };
  const w = expWhere(user, f);
  const rows = mergeSplits(await q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 300`, w.params));
  const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.amount), 0);
  const open = isSO
    ? (await issueRows(user)).map((i) => ({ ...i, left: i.amount - i.returned - Number(i.spent) })).filter((i) => i.left > 0)
    : [];
  const payeeAdvances = isSO
    ? []
    : (await issueRows(user)).filter((i) => i.payee_id).map((i) => ({ ...i, left: i.amount - i.returned - Number(i.spent) })).filter((i) => i.left > 0);
  const dq = isSO
    ? (await q(`SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int AS c, COALESCE(SUM(amount), 0)::float8 AS v FROM pc2_expenses WHERE submitted_by = $1 AND status = 'draft'`, [user.id]))[0]
    : null;

  const showAll = sp.more === '1' || !!f.q;
  const shown = showAll ? rows : rows.slice(0, 10);
  const mp = new URLSearchParams();
  for (const k of ['office', 'status', 'fund', 'month', 'q']) if (sp[k]) mp.set(k, sp[k]);
  if (!showAll) mp.set('more', '1');
  const moreHref = '/expenses' + (mp.toString() ? '?' + mp.toString() : '');
  const waiting = isOM ? shown.filter((r) => ['submitted', 'verified'].includes(r.status)) : [];

  return (
    <>
      <div className='head'>
        <div>
          <h1>Expenses</h1>
          <p className='muted'>
            {isOM ? 'All offices - you review and submit to Accounts' : isSO ? 'Spend from your advances and submit them for adjustment' : 'Both offices - expenses are reviewed and approved by the Sr. Ops Manager'}
          </p>
        </div>
      </div>
      <Flash sp={sp} />

      {dq && dq.c > 0 ? (
        <form action={submitDrafts} className='card submitbar'>
          <div>
            <b>{dq.c} expense(s) - {pkr(dq.v)}</b> waiting to be submitted
            <div className='muted'>They stay with you (and in your advance) until you submit them to the Sr. SO / Sr. Ops Manager.</div>
          </div>
          <button className='btn primary' type='submit'>Submit expenses</button>
        </form>
      ) : null}

      <details className='card' open>
        <summary>Add expense</summary>
        {isSO ? (
            <SoExpenseForm
              action={addExpense}
              advances={open.map((i) => ({ id: i.id, fund: i.fund, left: i.left, issued_on: i.issued_on }))}
              funds={FUNDS}
              categories={CATEGORIES}
              today={today()}
            />
          ) : (
          <form action={addExpense} className='form'>
            <label>Date<input type='date' name='spent_on' defaultValue={today()} required /></label>
            <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
            <label>Category
              <select name='category' required>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {payeeAdvances.length ? (
              <label className='wide'>Spent by an advance-only team member?
                <select name='issue_id' defaultValue=''>
                  <option value=''>No - this is my own expense (pick the fund below)</option>
                  {payeeAdvances.map((i) => <option key={i.id} value={i.id}>{i.holder + ' - ' + FUNDS[i.fund] + ' advance #' + i.id + ' (left ' + pkr(i.left) + ')'}</option>)}
                </select>
              </label>
            ) : null}
            <label>Paid from fund
              <select name='fund' defaultValue='petty'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            {!isSO ? (
              <label>Office
                <select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select>
              </label>
            ) : null}
            <label className='wide'>Description<input name='description' placeholder='What was it for?' /></label>
            <button className='btn primary' type='submit'>{isOM ? 'Record expense' : 'Add expense'}</button>
          </form>
        )}
      </details>

      {(
        <details className='card'>
          <summary>Paste expenses from Excel</summary>
          <PasteExpenses
            action={addExpensesBulk}
            isSO={isSO}
            isOM={isOM}
            officeCode={user.office_code}
            advances={[
              ...Object.keys(FUNDS).map((k) => ({ id: 'auto:' + k, label: FUNDS[k] + ' - in hand ' + pkr(open.filter((i) => i.fund === k).reduce((a, i) => a + i.left, 0)) })),
            ]}
            funds={Object.entries(FUNDS)}
            categories={CATEGORIES}
            today={today()}
          />
        </details>
      )}

      <form method='get' className='card filters'>
        <label className='wide'>Search
          <input type='search' name='q' defaultValue={f.q} placeholder='Description, category, amount or person' maxLength={60} />
        </label>
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

      {rows.length > 0 ? (
        <FundMatrix
          title='Expenses in this list by fund and office - PKR'
          cols={['LHR', 'ISB']}
          rows={buildMatrix(rows.filter((r) => r.status !== 'rejected'), 'office', ['LHR', 'ISB'])}
          note='Follows the search and filters above (rejected expenses are left out).'
        />
      ) : null}

      <div className='card'>
        {(isOM && shown.some((r) => r.status !== 'sent')) || (isSO && shown.some((r) => ['draft', 'submitted'].includes(r.status))) ? (
          <BulkApprove approveAction={approveAll} deleteAction={deleteExpensesBulk} canApprove={isOM} />
        ) : null}
        <ExpenseTable rows={shown} user={user} back='/expenses' selectable />
        {rows.length > 10 ? (
          <p className='totals'>{showAll ? 'Showing all ' + rows.length : 'Showing the latest 10 of ' + rows.length} - <Link href={moreHref}>{showAll ? 'Show fewer' : 'See more'}</Link></p>
        ) : null}
        <p className='totals'>
          Not yet submitted <b>{pkr(sum('draft'))}</b> - Awaiting SOM review <b>{pkr(sum('submitted') + sum('verified'))}</b> - Ready for Accounts <b>{pkr(sum('approved'))}</b> - Sent <b>{pkr(sum('sent'))}</b> ({rows.length} shown)
        </p>
      </div>

      {!isSO ? <ExpenseInsights /> : null}
    </>
  );
}
