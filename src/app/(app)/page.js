import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, fundSummary, issueRows, soAccount, waitingByFund, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { pkr, STATUS_LABEL, FUNDS } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import CountUp from '@/components/CountUp';
import AdjustedPosition from '@/components/AdjustedPosition';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';
import { submitDrafts } from '@/lib/actions';

const PIPE = ['draft', 'submitted', 'approved', 'sent'];

// Cash in hand turns red below 20% of what was issued, green otherwise (Support Officer dashboard).
const LOWBOX = { color: 'var(--bad, #b3261e)', background: '#fbd3d3', padding: '1px 7px', borderRadius: 3, display: 'inline-block' };
const GOODBOX = { color: '#1b6e34', background: '#d9f1df', padding: '1px 7px', borderRadius: 3, display: 'inline-block' };

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
            <div className='s'><CountUp value={p.v} /></div>
          </Link>
        );
      })}
    </div>
  );
}

// The four stages of an expense as one progress line. Stages already passed are gold, stages holding expenses glow.
function Stepper({ pipe }) {
  const info = PIPE.map((st) => pipe[st] || { c: 0, v: 0 });
  const last = info.reduce((a, p, i) => (p.c > 0 ? i : a), -1);
  return (
    <div className='stepper'>
      {PIPE.map((st, i) => {
        const p = info[i];
        const cls = p.c > 0 ? ' now' : i < last ? ' done empty' : ' empty';
        return (
          <Link key={st} href={'/expenses?status=' + st} className={'st' + cls}>
            <div className='dot'>{i + 1}</div>
            <div className='t'>{STATUS_LABEL[st]}</div>
            <div className='c'>{p.c}</div>
            <div className='s'><CountUp value={p.v} /></div>
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
    q(`SELECT e.status, COUNT(DISTINCT COALESCE(e.split_group, e.id::text))::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 10`, w.params),
  ]);
  const lowCash = acct.advances > 0 && acct.cash < 0.2 * acct.advances;
  const usedPct = acct.advances > 0 ? Math.min(100, Math.round((acct.spent / acct.advances) * 100)) : 0;
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
      {lowCash ? (
        <div className='attn'>
          <b>Your cash in hand is low</b>
          <span>{pkr(acct.cash)} left of the {pkr(acct.advances)} issued to you. Ask Mohsin for a new advance when you need one.</span>
          <a className='btn primary' href='#my-advances'>Open my advances</a>
        </div>
      ) : acct.draft > 0 ? (
        <div className='attn'>
          <b>Expenses ready to submit</b>
          <span>{pkr(acct.draft)} of your expenses are waiting to be submitted.</span>
          <a className='btn primary' href='#submit-bar'>Go to submit</a>
        </div>
      ) : null}
      <div className='kpis'>
        <div className='card kpi'><span>Advances</span><b><CountUp value={acct.advances} /></b><small>Issued to you in total</small></div>
        <div className='card kpi alt'><span>Expenses</span><b><CountUp value={acct.spent} /></b><small>Not yet submitted: {pkr(acct.draft)}</small></div>
        <div className='card kpi'><span>Advances Outstanding</span><b><CountUp value={acct.outstanding} /></b><small>Advances issued to you minus the expenses you have submitted</small></div>
        <div className={'card kpi alt' + (acct.cash < 0 ? ' neg' : '')}><span>CIH</span><b style={acct.advances > 0 ? (acct.cash < 0.2 * acct.advances ? LOWBOX : GOODBOX) : undefined}><CountUp value={acct.cash} /></b><small>{lowCash ? 'Below 20% of what was issued' : 'Cash you hold now'}</small></div>
      </div>
      {acct.advances > 0 ? (
        <div className='card'>
          <h3>How Much Of Your Advance Is Spent</h3>
          <div className='spentbar'><i style={{ width: usedPct + '%' }} /></div>
          <div className='barrow'><span><b>{pkr(acct.spent)}</b> spent of <b>{pkr(acct.advances)}</b> issued</span><span><b>{usedPct}%</b> used, <b>{pkr(acct.cash)}</b> left</span></div>
        </div>
      ) : null}
      {acct.draft > 0 ? (
        <form action={submitDrafts} id='submit-bar' className='card submitbar'>
          <div>
            <b>{pkr(acct.draft)}</b> of expenses are ready to submit
            <div className='muted'>Submitting sends them to the Sr. Ops Manager for review and clears them from your advance.</div>
          </div>
          <button className='btn primary' type='submit'>Submit expenses</button>
        </form>
      ) : null}
      <div className='card'>
        <h3>Where My Expenses Stand</h3>
        <Stepper pipe={byStatus(pipeRows)} />
      </div>
      <div className='card' id='my-advances'>
        <h3>My Advances</h3>
        {issues.length === 0 ? <p className='muted'>No advance has been issued to you yet.</p> : (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>#</th><th>Date</th><th>Fund</th><th className='r'>Issued</th><th className='r'>Spent</th><th className='r'>Returned</th><th className='r'>In hand</th><th></th></tr></thead>
              <tbody>
                {issues.map((i) => (
                  <tr key={i.id} className={i.amount - i.returned - Number(i.spent) <= 0 ? 'rowdone' : ''}>
                    <td>{i.id}</td><td className='nw'>{i.issued_on}</td><td>{FUNDS[i.fund]}</td>
                    <td className='r nw'>{pkr(i.amount)}</td><td className='r nw'><span className='mini'><i style={{ width: Math.min(100, Math.round((Number(i.spent) / Math.max(1, Number(i.amount))) * 100)) + '%' }} /></span>{pkr(i.spent)}</td><td className='r nw'>{pkr(i.returned)}</td>
                    <td className='r nw'><b style={acct.advances > 0 ? (acct.cash < 0.2 * acct.advances ? LOWBOX : GOODBOX) : undefined}>{pkr(i.amount - i.returned - Number(i.spent))}</b></td>
                    <td>{i.amount - i.returned - Number(i.spent) <= 0 ? <span className='tag ok'>Fully spent</span> : <span className='tag open'>Open</span>}</td>
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
    q(`SELECT e.status, COUNT(DISTINCT COALESCE(e.split_group, e.id::text))::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${todoWhere} ORDER BY e.created_at LIMIT 25`, [...w.params, todoStatuses]),
    fundSummary({ from, to }),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value FROM pc2_expenses e JOIN pc2_offices o ON o.id = e.office_id WHERE e.status <> 'rejected' AND ($1::date IS NULL OR e.spent_on >= $1::date) AND ($2::date IS NULL OR e.spent_on <= $2::date) GROUP BY o.code`, [from || null, to || null]),
    waitingByFund({ to }),
  ]);

  const pipe = byStatus(pipeRows);
  const T = funds.total;
  const isEmptyFund = (f) => ['received', 'spent', 'sent', 'returned', 'outstanding', 'remaining', 'pool', 'ssoCash', 'soCash', 'payeeCash'].every((k) => !Number(f[k]));
  const usedFunds = funds.rows.filter((f) => !isEmptyFund(f));
  const emptyFunds = funds.rows.filter(isEmptyFund);
  const offLine = (c) => Number((offSpent.find((r) => r.label === c) || {}).value || 0);
  // Same layout as the Support Officer dashboard: what needs you, four big figures, where the cash is, then the detail.
  const toVerify = (pipe.submitted || {}).c || 0;
  const toApprove = (pipe.verified || {}).c || 0;
  const waitN = isOM ? toVerify + toApprove : toVerify;
  const waitV = isOM ? ((pipe.submitted || {}).v || 0) + ((pipe.verified || {}).v || 0) : (pipe.submitted || {}).v || 0;
  const cashParts = [
    ['Sr. Ops Manager', T.pool, 'seg1'],
    ['Sr. Support Officer', T.ssoCash, 'seg2'],
    ['Support Officers', T.soCash, 'seg3'],
    ['BD-I', T.payeeCash, 'seg4'],
  ];
  const cashSum = cashParts.reduce((a, c) => a + Math.max(0, Number(c[1])), 0);

  return (
    <>
      <div className='chips' style={{ marginBottom: 12 }}>
        {['all', 'LHR', 'ISB'].map((o) => (
          <Link key={o} href={qs(o)} className={'chip' + (office === o ? ' on' : '')}>{o === 'all' ? 'Both offices' : o}</Link>
        ))}
      </div>
      <Flash sp={sp} />

      {waitN ? (
        <div className='attn'>
          <b>{isOM ? 'Waiting for your decision' : 'Waiting for your verification'}</b>
          <span>{waitN} expense{waitN > 1 ? 's' : ''} ({pkr(waitV)}){isOM && toVerify && toApprove ? ': ' + toVerify + ' to verify, ' + toApprove + ' to approve' : ''}.</span>
          <a className='btn primary' href='#to-review'>Review them</a>
        </div>
      ) : null}

      <div className='kpis'>
        <div className='card kpi'><span>Advances</span><b><CountUp value={T.received} /></b><small>{periodLabel}</small></div>
        <div className='card kpi alt'><span>Expenses</span><b><CountUp value={T.spent} /></b><small>{periodLabel}</small></div>
        <div className='card kpi'><span>Advances Outstanding</span><b><CountUp value={T.outstanding} /></b><small>Not yet cleared with Accounts</small></div>
        <div className={'card kpi alt' + (T.remaining < 0 ? ' neg' : '')}><span>CIH</span><b><CountUp value={T.remaining} /></b><small>Cash in hand, all holders</small></div>
      </div>

      {cashSum > 0 ? (
        <div className='card'>
          <h3>Where The Cash Is</h3>
          <div className='cashbar'>
            {cashParts.map(([label, v, cls]) => (Number(v) > 0 ? <i key={label} className={cls} style={{ width: (Number(v) / cashSum) * 100 + '%' }} title={label} /> : null))}
          </div>
          <div className='cashkey'>
            {cashParts.map(([label, v, cls]) => (
              <span key={label}><em className={cls} />{label} <b>{pkr(Math.max(0, Number(v)))}</b></span>
            ))}
          </div>
        </div>
      ) : null}

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

      <div className='card'>
        <h3>Where Expenses Stand</h3>
        <Stepper pipe={pipe} />
      </div>

      {todo.length ? (
        <>
          <h2 id='to-review'>{isOM ? 'Needs your review' : 'Waiting for your verification'}</h2>
          <div className='card'>
            <ExpenseTable rows={todo.slice(0, 5)} user={user} back='/' />
            {todo.length > 5 ? <p className='totals'>Showing 5 of {todo.length} - <Link href='/expenses?status=submitted'>View all on the Expenses page</Link></p> : null}
          </div>
        </>
      ) : null}

      <div className='card'>
        <h3>Funds</h3>
        <div className='tablewrap'>
          <table className='tiles'>
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
                  <td className='r nw g'>{pkr(f.outstanding)}</td>
                  <td className={'r nw g' + (f.remaining < 0 ? ' neg-t' : '')}><b>{pkr(f.remaining)}</b></td>
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
                <td className='r nw g' style={{ fontWeight: 700 }}>{pkr(T.outstanding)}</td>
                <td className='r nw g' style={{ fontWeight: 700 }}>{pkr(T.remaining)}</td>
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
          <table className='tiles'>
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
                  <td className='r nw g'><b>{pkr(f.remaining)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total</b></td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.pool)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.ssoCash)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.soCash)}</td>
                <td className='r nw g' style={{ fontWeight: 700 }}>{pkr(T.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
