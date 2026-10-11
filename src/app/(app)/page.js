import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, fundBalances, EXP_FROM, EXP_COLS } from '@/lib/queries';
import { pkr } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import Flash from '@/components/Flash';

function Bars({ rows }) {
  if (!rows.length) return <p className='muted'>No approved expenses yet.</p>;
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

export default async function Dashboard({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const office = isOM ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : 'all') : user.office_code;
  const w = expWhere(user, { office });
  const approved = w.where ? w.where + ` AND e.status = 'approved'` : `WHERE e.status = 'approved'`;
  const pending = w.where ? w.where + ` AND e.status = 'pending'` : `WHERE e.status = 'pending'`;
  const month = new Date().toISOString().slice(0, 7);
  const n = w.params.length + 1;

  const [tot, cats, offs, months, pend, recent, funds] = await Promise.all([
    q(`SELECT COALESCE(SUM(e.amount), 0)::float8 AS total, COALESCE(SUM(CASE WHEN to_char(e.spent_on, 'YYYY-MM') = $${n} THEN e.amount END), 0)::float8 AS mtd ${EXP_FROM} ${approved}`, [...w.params, month]),
    q(`SELECT e.category AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${approved} GROUP BY e.category ORDER BY value DESC LIMIT 8`, w.params),
    q(`SELECT o.code AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${approved} GROUP BY o.code ORDER BY o.code`, w.params),
    q(`SELECT to_char(e.spent_on, 'YYYY-MM') AS label, SUM(e.amount)::float8 AS value ${EXP_FROM} ${approved} AND e.spent_on >= (date_trunc('month', now()) - interval '5 months')::date GROUP BY 1 ORDER BY 1`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${pending} ORDER BY e.created_at LIMIT 25`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 8`, w.params),
    isOM ? fundBalances() : Promise.resolve(null),
  ]);

  const total = Number(tot[0].total);
  const mtd = Number(tot[0].mtd);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dashboard</h1>
          <p className='muted'>{isOM ? (office === 'all' ? 'Both offices' : office + ' office') : user.role === 'sso' ? user.office_code + ' office' : 'Your expenses'}</p>
        </div>
        {isOM ? (
          <div className='chips'>
            {['all', 'LHR', 'ISB'].map((o) => (
              <Link key={o} href={o === 'all' ? '/' : '/?office=' + o} className={'chip' + (office === o ? ' on' : '')}>{o === 'all' ? 'Both offices' : o}</Link>
            ))}
          </div>
        ) : null}
      </div>
      <Flash sp={sp} />

      {funds ? (
        <>
          <div className='kpis'>
            <div className='card kpi'><span>Total received</span><b>{pkr(funds.total.received)}</b></div>
            <div className='card kpi'><span>Total spent (approved)</span><b>{pkr(funds.total.spent)}</b></div>
            <div className={'card kpi' + (funds.total.balance < 0 ? ' neg' : '')}><span>Available balance</span><b>{pkr(funds.total.balance)}</b></div>
            <div className='card kpi'><span>Awaiting approval</span><b>{pend.length}</b><small>{pkr(funds.total.pending)}</small></div>
          </div>
          <h2>Funds</h2>
          <div className='funds'>
            {funds.rows.map((f) => (
              <div className='card fund' key={f.key}>
                <div className='fund-h'><b>{f.label}</b><span className={f.balance < 0 ? 'neg-t' : ''}>{pkr(f.balance)}</span></div>
                <div className='track'><div className='fill' style={{ width: Math.min(100, f.received ? (f.spent / f.received) * 100 : 0) + '%' }} /></div>
                <small className='muted'>Received {pkr(f.received)} - Spent {pkr(f.spent)}{f.pending ? ' - Pending ' + pkr(f.pending) : ''}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className='kpis'>
          <div className='card kpi'><span>Spent this month</span><b>{pkr(mtd)}</b></div>
          <div className='card kpi'><span>Spent in total</span><b>{pkr(total)}</b></div>
          <div className='card kpi'><span>Awaiting approval</span><b>{pend.length}</b></div>
        </div>
      )}

      {isOM ? (
        <div className='kpis two'>
          <div className='card kpi'><span>Spent this month{office === 'all' ? '' : ' (' + office + ')'}</span><b>{pkr(mtd)}</b></div>
          <div className='card kpi'><span>Spent in total{office === 'all' ? '' : ' (' + office + ')'}</span><b>{pkr(total)}</b></div>
        </div>
      ) : null}

      {isOM && pend.length ? (
        <>
          <h2>Pending approval</h2>
          <div className='card'><ExpenseTable rows={pend} user={user} back='/' /></div>
        </>
      ) : null}

      <div className='grid2'>
        {isOM ? (
          <div className='card'><h3>Spend by office</h3><Bars rows={num(offs)} /></div>
        ) : null}
        <div className='card'><h3>Spend by category</h3><Bars rows={num(cats)} /></div>
        <div className='card'><h3>Last 6 months</h3><Bars rows={num(months)} /></div>
      </div>

      <div className='head'><h2>Recent expenses</h2><Link href='/expenses' className='btn ghost'>View all</Link></div>
      <div className='card'><ExpenseTable rows={recent} user={user} back='/' /></div>
    </>
  );
}
