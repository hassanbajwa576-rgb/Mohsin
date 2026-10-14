import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, fundSummary, issueRows, soAccount, fundOfficeSpend, EXP_FROM, EXP_COLS } from '@/lib/queries';
import FundMatrix, { buildMatrix } from '@/components/FundMatrix';
import { pkr, STATUS_LABEL, FUNDS } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import FundCard from '@/components/FundCard';
import CashSplit from '@/components/CashSplit';
import { OfficeSplit } from '@/components/OfficeTag';
import Flash from '@/components/Flash';
import { submitDrafts } from '@/lib/actions';

const PIPE = ['draft', 'submitted', 'approved', 'sent'];

function Bars({ rows }) {
  if (!rows.length) return <p className='muted'>Nothing recorded yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className='bars'>
      {rows.map((r) => (
        <div className='bar' key={r.label}>
          <div className='bar-top'><span>{r.label}</span><b>{pkr(r.value)}</b></div>
          <div className='track'><div className='fill' style={{ width: (r.value / max) * 100 + '%' }} /></div>
        </div>
      ))}
    </div>
  );
}

const num = (rows) => rows.map((r) => ({ label: r.label, value: Number(r.value) }));
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

async function SoDashboard({ user, sp }) {
  const issues = await issueRows(user);
  const acct = await soAccount(user.id);
  const w = expWhere(user, {});
  const [pipeRows, recent] = await Promise.all([
    q(`SELECT e.status, COUNT(*)::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 10`, w.params),
  ]);
  const inHand = issues.reduce((a, i) => a + i.amount - i.returned - Number(i.spent), 0);
  const received = issues.reduce((a, i) => a + i.amount, 0);
  const spent = issues.reduce((a, i) => a + Number(i.spent), 0);
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
  const live = w.where ? w.where + ` AND e.status <> 'rejected'` : `WHERE e.status <> 'rejected'`;
  const todoStatuses = isOM ? ['submitted', 'verified'] : [];
  const todoWhere = (w.where ? w.where + ' AND ' : 'WHERE ') + 'e.status = ANY($' + (w.params.length + 1) + '::text[])';
  const month = new Date().toISOString().slice(0, 7);
  const n = w.params.length + 1;

  const [pipeRows, tot, cats, offs, months, todo, recent, funds, offSpent] = await Promise.all([
    q(`SELECT e.status, COUNT(*)::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT COALESCE(SUM(e.amount), 0)::float8 AS total, COALESCE(SUM(CASE WHEN to_char(e.spent_on, 'YYYY-MM') = $${n} THEN e.amount END), 0)::float8 AS mtd ${EXP_FROM} ${live}`, [...w.params, month]),
    q(`SELECT e.category AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${live} GROUP BY e.category ORDER BY value DESC LIMIT 8`, w.params),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${live} GROUP BY o.code ORDER BY o.code`, w.params),
    q(`SELECT to_char(e.spent_on, 'YYYY-MM') AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${live} ${from ? '' : `AND e.spent_on >= (date_trunc('month', now()) - interval '5 months')::date`} GROUP BY 1 ORDER BY 1`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${todoWhere} ORDER BY e.created_at LIMIT 25`, [...w.params, todoStatuses]),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 8`, w.params),
    fundSummary({ from, to }),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.status <> 'rejected' AND ($1::date IS NULL OR e.spent_on >= $1::date) AND ($2::date IS NULL OR e.spent_on <= $2::date) GROUP BY o.code`, [from || null, to || null]),
  ]);

  const pipe = byStatus(pipeRows);
  // Fund x office tables: this calendar month, and the chosen period (all time when no filter).
  const [yNow, mNow] = month.split('-').map(Number);
  const monthEnd = month + '-' + String(new Date(Date.UTC(yNow, mNow, 0)).getUTCDate()).padStart(2, '0');
  const [spentMonth, spentPeriod] = await Promise.all([
    fundOfficeSpend({ from: month + '-01', to: monthEnd }),
    fundOfficeSpend({ from, to }),
  ]);
  const total = Number(tot[0].total);
  const mtd = Number(tot[0].mtd);
  const T = funds.total;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dashboard</h1>
          <p className='muted subline'>{office === 'all' ? 'Both offices' : office + ' office'} | {isOM ? 'Sr. Ops Manager' : 'Sr. Support Officer'} | {periodLabel}</p>
        </div>
        <div className='chips'>
          {['all', 'LHR', 'ISB'].map((o) => (
            <Link key={o} href={qs(o)} className={'chip' + (office === o ? ' on' : '')}>{o === 'all' ? 'Both offices' : o}</Link>
          ))}
        </div>
      </div>
      <Flash sp={sp} />

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

      <div className='kpis'>
        <div className='card kpi'><span>Advances</span><b>{pkr(T.received)}</b></div>
        <div className='card kpi alt'><span>Expenses</span><b>{pkr(T.spent)}</b><OfficeSplit rows={offSpent} /></div>
        <div className={'card kpi' + (T.remaining < 0 ? ' neg' : '')}><span>CIH</span><b>{pkr(T.remaining)}</b><CashSplit pool={T.pool} sso={T.ssoCash} so={T.soCash} /></div>
        <div className='card kpi alt'><span>Advances Outstanding</span><b>{pkr(T.outstanding)}</b><small>Clears only when expenses are submitted to Accounts - {pkr(T.unsent)} not yet submitted</small></div>
      </div>
      <div className='grid2'>
        <FundMatrix title={'Spent this month (' + month + ') - PKR'} cols={['LHR', 'ISB']} rows={buildMatrix(spentMonth, 'office', ['LHR', 'ISB'])} />
        <FundMatrix title={'Spent ' + (from ? periodLabel.toLowerCase() : 'in total') + ' - PKR'} cols={['LHR', 'ISB']} rows={buildMatrix(spentPeriod, 'office', ['LHR', 'ISB'])} />
      </div>

      <h2>Funds</h2>
      <div className='funds'>
        {funds.rows.map((f) => (
          <FundCard key={f.key} f={f} />
        ))}
      </div>

      <h2>Expense pipeline</h2>
      <Pipeline pipe={pipe} hot={todoStatuses} />

      {todo.length ? (
        <>
          <h2>{isOM ? 'Needs your review' : 'Waiting for your verification'}</h2>
          <div className='card'><ExpenseTable rows={todo} user={user} back='/' /></div>
        </>
      ) : null}

      <div className='grid2'>
        <div className='card'><h3>Spend by office</h3><Bars rows={num(offs)} /></div>
        <div className='card'><h3>Spend by category</h3><Bars rows={num(cats)} /></div>
        <div className='card'><h3>{from ? 'By month' : 'Last 6 months'}</h3><Bars rows={num(months)} /></div>
      </div>

      <div className='head' style={{ marginTop: 24 }}><h2 style={{ margin: 0 }}>Recent expenses</h2><Link href='/expenses' className='btn ghost'>View all</Link></div>
      <div className='card'><ExpenseTable rows={recent} user={user} back='/' /></div>
    </>
  );
}
