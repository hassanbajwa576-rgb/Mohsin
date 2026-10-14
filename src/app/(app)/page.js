import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, fundSummary, issueRows, soAccount, waitingByFund, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { pkr, STATUS_LABEL, FUNDS } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';
import { submitDrafts } from '@/lib/actions';

const PIPE = ['draft', 'submitted', 'approved', 'sent'];

const byStatus = (rows) => Object.fromEntries(rows.map((r) => [r.status, { c: Number(r.c), v: Number(r.v) }]));

function Pipeline({ pipe, hot }) {
  return (
    <div className='pipe'>
      {PIPE.map((st, i) => {
        const p = pipe[st] || { c: 0, v: 0 };
        return (
          <Link key={st} href={'/expenses?status=' + st} className={'card step' + (hot.includes(st) && p.c > 0 ? ' now' : '')}>
            <div className='n'>{i + 1}</div>
            <div className='t'>{STATUS_LABEL[st]}</div>
            <div className='c'>{p.c}</div>
            <div className='s'>{pkr(p.v)}</div>
          </Link>
        );
      })}
    </div>
  );
}

// Net position per fund: what is still open after everything settled with Accounts.
function AdjustedPosition({ rows, waiting }) {
  const w = (k, g) => Number((waiting.find((x) => x.fund === k && x.grp === g) || {}).v || 0);
  const data = rows.map((f) => ({ key: f.key, label: f.label, cash: f.remaining, drafts: w(f.key, 'draft'), review: w(f.key, 'review'), ready: w(f.key, 'ready'), net: f.outstanding }));
  const tot = (k) => data.reduce((a, r) => a + r[k], 0);
  return (
    <div className='card'>
      <h3>Adjusted position</h3>
      <div className='tablewrap'>
        <table>
          <thead>
            <tr><th>Fund</th><th className='r'>Cash in hand</th><th className='r'>Not yet submitted</th><th className='r'>Awaiting approval</th><th className='r'>Ready for Accounts</th><th className='r'>Net position</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.key}>
                <td><b>{r.label}</b></td>
                <td className='r nw'>{pkr(r.cash)}</td>
                <td className='r nw'>{pkr(r.drafts)}</td>
                <td className='r nw'>{pkr(r.review)}</td>
                <td className='r nw'>{pkr(r.ready)}</td>
                <td className='r nw'><b>{pkr(r.net)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              {['cash', 'drafts', 'review', 'ready', 'net'].map((k) => (
                <td key={k} className='r nw' style={{ fontWeight: 700 }}>{pkr(tot(k))}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className='muted' style={{ marginTop: 8 }}>Net position = cash in hand + expenses still waiting for adjustment with Accounts. Anything already adjusted is not shown.</p>
    </div>
  );
}

async function SoDashboard({ user, sp }) {
  const issues = await issueRows(user);
  const acct = await soAccount(user.id);
  const w = expWhere(user, {});
  const [pipeRows, recent] = await Promise.all([
    q(`SELECT e.status, COUNT(*)::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 10`, w.params),
  ]);
  return (
    <>
      <div className='head'>
        <div>
          <h1>My dashboard</h1>
          <p className='muted'>Advances issued to you, what you have spent and what is awaiting review</p>
        </div>
        <Link href='/expenses' className='btn primary'>Submit an expense</Link>
      </div>
      <Flash sp={sp} />
      <div className='kpis'>
        <div className='card kpi'><span>Advances</span><b>{pkr(acct.advances)}</b></div>
        <div className='card kpi alt'><span>Expenses</span><b>{pkr(acct.spent)}</b><small>Not yet submitted: {pkr(acct.draft)}</small></div>
        <div className='card kpi'><span>Advances Outstanding</span><b>{pkr(acct.outstanding)}</b><small>Reduces only when you submit your expenses</small></div>
        <div className={'card kpi alt' + (acct.cash < 0 ? ' neg' : '')}><span>CIH</span><b>{pkr(acct.cash)}</b></div>
      </div>
      {acct.draft > 0 ? (
        <form action={submitDrafts} className='card submitbar'>
          <div>
            <b>{pkr(acct.draft)}</b> of expenses are ready to submit
            <div className='muted'>Submitting sends them to the Sr. Ops Manager for review and clears them from your advance.</div>
          </div>
          <button className='btn primary' type='submit'>Submit expenses</button>
        </form>
      ) : null}
      <h2>Where my expenses stand</h2>
      <Pipeline pipe={byStatus(pipeRows)} hot={['draft']} />
      <h2>My advances</h2>
      <div className='card'>
        {issues.length === 0 ? <p className='muted'>No advance has been issued to you yet.</p> : (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>#</th><th>Date</th><th>Fund</th><th className='r'>Issued</th><th className='r'>Spent</th><th className='r'>Returned</th><th className='r'>In hand</th></tr></thead>
              <tbody>
                {issues.map((i) => (
                  <tr key={i.id}>
                    <td>{i.id}</td><td className='nw'>{i.issued_on}</td><td>{FUNDS[i.fund]}</td>
                    <td className='r nw'>{pkr(i.amount)}</td><td className='r nw'>{pkr(i.spent)}</td><td className='r nw'>{pkr(i.returned)}</td>
                    <td className='r nw'><b>{pkr(i.amount - i.returned - Number(i.spent))}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <h2>Recent expenses</h2>
      <div className='card'><ExpenseTable rows={recent} user={user} back='/' /></div>
    </>
  );
}

export default async function Dashboard({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (user.role === 'so') return <SoDashboard user={user} sp={sp} />;

  const isOM = user.role === 'om';
  const office = ['LHR', 'ISB'].includes(sp.office) ? sp.office : 'all';

  // Period filter (year and/or month). Empty means all time.
  const nowYear = new Date().getFullYear();
  const years = [0, 1, 2].map((i) => String(nowYear - i));
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const year = years.includes(sp.year) ? sp.year : '';
  const mm = MONTH_NAMES.some((_, i) => String(i + 1).padStart(2, '0') === sp.month) ? sp.month : '';
  const yy = year || (mm ? String(nowYear) : '');
  let from = '';
  let to = '';
  if (yy && mm) {
    const last = new Date(Number(yy), Number(mm), 0).getDate();
    from = yy + '-' + mm + '-01';
    to = yy + '-' + mm + '-' + String(last).padStart(2, '0');
  } else if (yy) {
    from = yy + '-01-01';
    to = yy + '-12-31';
  }
  const periodLabel = from ? (mm ? MONTH_NAMES[Number(mm) - 1] + ' ' + yy : yy) : 'All time';
  const qs = (o) => {
    const params = new URLSearchParams();
    if (o !== 'all') params.set('office', o);
    if (year) params.set('year', year);
    if (mm) params.set('month', mm);
    const s = params.toString();
    return s ? '/?' + s : '/';
  };
  const w = expWhere(user, { office, from, to });
  const todoStatuses = isOM ? ['submitted', 'verified'] : [];
  const todoWhere = (w.where ? w.where + ' AND ' : 'WHERE ') + 'e.status = ANY($' + (w.params.length + 1) + '::text[])';

  const [pipeRows, todo, funds, offSpent, waiting] = await Promise.all([
    q(`SELECT e.status, COUNT(*)::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${todoWhere} ORDER BY e.created_at LIMIT 25`, [...w.params, todoStatuses]),
    fundSummary({ from, to }),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.status <> 'rejected' AND ($1::date IS NULL OR e.spent_on >= $1::date) AND ($2::date IS NULL OR e.spent_on <= $2::date) GROUP BY o.code`, [from || null, to || null]),
    waitingByFund({ to }),
  ]);

  const pipe = byStatus(pipeRows);
  const T = funds.total;
  const isEmptyFund = (f) => ['received', 'spent', 'sent', 'returned', 'outstanding', 'remaining', 'pool', 'ssoCash', 'soCash'].every((k) => !Number(f[k]));
  const usedFunds = funds.rows.filter((f) => !isEmptyFund(f));
  const emptyFunds = funds.rows.filter(isEmptyFund);
  const offLine = (c) => Number((offSpent.find((r) => r.label === c) || {}).value || 0);

  return (
    <>
      <div className='head'>
        <div>
          <p className='muted subline'>{office === 'all' ? 'Both offices' : office + ' office'} | {isOM ? 'Sr. Ops Manager' : 'Sr. Support Officer'} | {periodLabel}</p>
        </div>
        <div className='chips'>
          {['all', 'LHR', 'ISB'].map((o) => (
            <Link key={o} href={qs(o)} className={'chip' + (office === o ? ' on' : '')}>{o === 'all' ? 'Both offices' : o}</Link>
          ))}
        </div>
      </div>
      <Flash sp={sp} />

      <AdjustedPosition rows={funds.rows} waiting={waiting} />

      <form method='get' className='card filters compact'>
        {office !== 'all' ? <input type='hidden' name='office' value={office} /> : null}
        <label>Year
          <select name='year' defaultValue={year}>
            <option value=''>All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label>Month
          <select name='month' defaultValue={mm}>
            <option value=''>All months</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <Link href={office === 'all' ? '/' : '/?office=' + office} className='btn ghost'>Reset</Link>
        <span className='muted'>Advances and Expenses cover the period. CIH and Outstanding are balances to its end.</span>
      </form>

      <h2>Expense pipeline</h2>
      <Pipeline pipe={pipe} hot={todoStatuses} />

      {todo.length ? (
        <>
          <h2>{isOM ? 'Needs your review' : 'Waiting for your verification'}</h2>
          <div className='card'>
            <ExpenseTable rows={todo.slice(0, 5)} user={user} back='/' />
            {todo.length > 5 ? <p className='totals'>Showing 5 of {todo.length} - <Link href='/expenses?status=submitted'>View all on the Expenses page</Link></p> : null}
          </div>
        </>
      ) : null}

      <div className='card'>
        <h3>Funds</h3>
        <div className='tablewrap'>
          <table>
            <thead>
              <tr><th>Fund</th><th className='r'>Advances</th><th className='r'>Expenses</th><th className='r'>Submitted to Accounts</th><th className='r'>Returned to Accounts</th><th className='r'>Advances Outstanding</th><th className='r'>CIH</th></tr>
            </thead>
            <tbody>
              {usedFunds.map((f) => (
                <tr key={f.key}>
                  <td><b>{f.label}</b></td>
                  <td className='r nw'>{pkr(f.received)}</td>
                  <td className='r nw'>{pkr(f.spent)}</td>
                  <td className='r nw'>{pkr(f.sent)}</td>
                  <td className='r nw'>{pkr(f.returned)}</td>
                  <td className='r nw'>{pkr(f.outstanding)}</td>
                  <td className={'r nw' + (f.remaining < 0 ? ' neg-t' : '')}><b>{pkr(f.remaining)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total</b></td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.received)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.spent)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.sent)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.returned)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.outstanding)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {emptyFunds.length ? <p className='muted' style={{ marginTop: 8 }}>{emptyFunds.map((f) => f.label).join(', ')} - nothing recorded yet.</p> : null}
        <p className='muted' style={{ marginTop: 8 }}>Expenses by office: <OfficeTag o='LHR' /> {pkr(offLine('LHR'))} <OfficeTag o='ISB' /> {pkr(offLine('ISB'))}</p>
      </div>

      <div className='card'>
        <h3>Where the cash sits</h3>
        <div className='tablewrap'>
          <table>
            <thead>
              <tr><th>Fund</th><th className='r'>With Sr. Ops Manager</th><th className='r'>With Sr. SO</th><th className='r'>With SO</th><th className='r'>CIH</th></tr>
            </thead>
            <tbody>
              {usedFunds.map((f) => (
                <tr key={f.key}>
                  <td><b>{f.label}</b></td>
                  <td className='r nw'>{pkr(f.pool)}</td>
                  <td className='r nw'>{pkr(f.ssoCash)}</td>
                  <td className='r nw'>{pkr(f.soCash)}</td>
                  <td className='r nw'><b>{pkr(f.remaining)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total</b></td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.pool)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.ssoCash)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.soCash)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
