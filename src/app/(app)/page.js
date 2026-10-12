import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, fundSummary, issueRows, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { pkr, STATUS_LABEL, FUNDS } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import FundCard from '@/components/FundCard';
import CashSplit from '@/components/CashSplit';
import Flash from '@/components/Flash';

const PIPE = ['submitted', 'verified', 'approved', 'sent'];

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
        <div className={'card kpi' + (inHand < 0 ? ' neg' : '')}><span>Cash in hand</span><b>{pkr(inHand)}</b></div>
        <div className='card kpi alt'><span>Advances received</span><b>{pkr(received)}</b></div>
        <div className='card kpi alt'><span>Spent so far</span><b>{pkr(spent)}</b></div>
      </div>
      <h2>Where my expenses stand</h2>
      <Pipeline pipe={byStatus(pipeRows)} hot={['submitted']} />
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
  const w = expWhere(user, { office });
  const live = w.where ? w.where + ` AND e.status <> 'rejected'` : `WHERE e.status <> 'rejected'`;
  const todoStatuses = isOM ? ['submitted', 'verified'] : ['submitted'];
  const todoWhere = (w.where ? w.where + ' AND ' : 'WHERE ') + 'e.status = ANY($' + (w.params.length + 1) + '::text[])';
  const month = new Date().toISOString().slice(0, 7);
  const n = w.params.length + 1;

  const [pipeRows, tot, cats, offs, months, todo, recent, funds] = await Promise.all([
    q(`SELECT e.status, COUNT(*)::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT COALESCE(SUM(e.amount), 0)::float8 AS total, COALESCE(SUM(CASE WHEN to_char(e.spent_on, 'YYYY-MM') = $${n} THEN e.amount END), 0)::float8 AS mtd ${EXP_FROM} ${live}`, [...w.params, month]),
    q(`SELECT e.category AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${live} GROUP BY e.category ORDER BY value DESC LIMIT 8`, w.params),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${live} GROUP BY o.code ORDER BY o.code`, w.params),
    q(`SELECT to_char(e.spent_on, 'YYYY-MM') AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${live} AND e.spent_on >= (date_trunc('month', now()) - interval '5 months')::date GROUP BY 1 ORDER BY 1`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${todoWhere} ORDER BY e.created_at LIMIT 25`, [...w.params, todoStatuses]),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 8`, w.params),
    fundSummary(),
  ]);

  const pipe = byStatus(pipeRows);
  const total = Number(tot[0].total);
  const mtd = Number(tot[0].mtd);
  const T = funds.total;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dashboard</h1>
          <p className='muted'>{office === 'all' ? 'Both offices - LHR and ISB' : office + ' office'} - {isOM ? 'Operations Manager view' : 'Senior Support Officer view'}</p>
        </div>
        <div className='chips'>
          {['all', 'LHR', 'ISB'].map((o) => (
            <Link key={o} href={o === 'all' ? '/' : '/?office=' + o} className={'chip' + (office === o ? ' on' : '')}>{o === 'all' ? 'Both offices' : o}</Link>
          ))}
        </div>
      </div>
      <Flash sp={sp} />

      <div className='kpis'>
        <div className='card kpi'><span>Advances received</span><b>{pkr(T.received)}</b></div>
        <div className='card kpi alt'><span>Expenses so far</span><b>{pkr(T.spent)}</b></div>
        <div className={'card kpi' + (T.remaining < 0 ? ' neg' : '')}><span>Remaining CIH till today</span><b>{pkr(T.remaining)}</b><CashSplit pool={T.pool} sso={T.ssoCash} so={T.soCash} /></div>
      </div>
      <div className='kpis'>
        <div className='card kpi alt'><span>Spent this month{office === 'all' ? '' : ' (' + office + ')'}</span><b>{pkr(mtd)}</b></div>
        <div className='card kpi alt'><span>Spent in total{office === 'all' ? '' : ' (' + office + ')'}</span><b>{pkr(total)}</b></div>
      </div>

      <h2>Expense pipeline</h2>
      <Pipeline pipe={pipe} hot={todoStatuses} />

      {todo.length ? (
        <>
          <h2>{isOM ? 'Needs your review' : 'Waiting for your verification'}</h2>
          <div className='card'><ExpenseTable rows={todo} user={user} back='/' /></div>
        </>
      ) : null}

      <h2>Funds</h2>
      <div className='funds'>
        {funds.rows.map((f) => (
          <FundCard key={f.key} f={f} />
        ))}
      </div>

      <div className='grid2'>
        <div className='card'><h3>Spend by office</h3><Bars rows={num(offs)} /></div>
        <div className='card'><h3>Spend by category</h3><Bars rows={num(cats)} /></div>
        <div className='card'><h3>Last 6 months</h3><Bars rows={num(months)} /></div>
      </div>

      <div className='head' style={{ marginTop: 24 }}><h2 style={{ margin: 0 }}>Recent expenses</h2><Link href='/expenses' className='btn ghost'>View all</Link></div>
      <div className='card'><ExpenseTable rows={recent} user={user} back='/' /></div>
    </>
  );
}
