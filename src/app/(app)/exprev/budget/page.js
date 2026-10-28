import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import { MONTHS, MON3, money, pkr, budgetView, budgetYear } from '@/lib/exprev';

export const dynamic = 'force-dynamic';

export default async function ExpRevBudget({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const year = await budgetYear();
  if (!year) {
    return (
      <>
        <div className='head'><div><h1>Budget vs Actual</h1></div></div>
        <div className='card'>
          <p className='muted'>The budget has not been loaded yet.</p>
          <Link href='/exprev/import' className='btn primary'>Load the workbook</Link>
        </div>
      </>
    );
  }
  const today = todayKey();
  const d = await budgetView(year);
  let m = sp.m === undefined ? (Number(today.slice(0, 4)) === year ? Number(today.slice(5, 7)) : 0) : Number(sp.m);
  if (!(m >= 0 && m <= 12)) m = 0;
  const pick = (a) => (m ? a[m - 1] : a.reduce((x, y) => x + y, 0));
  const g = d.rows.find((r) => r.kind === 'grand');
  const gb = g ? pick(g.b) : 0;
  const ga = g ? pick(g.a) : 0;
  const href = (mm) => '/exprev/budget?m=' + mm;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Budget vs Actual</h1>
          <p className='muted'>{year}: what was budgeted, what Ops spent (worked out from the entries), and what is in QuickBooks. Variance is budget minus actual, so red means over budget.</p>
        </div>
      </div>

      <div className='inline er-months'>
        <Link href={href(0)} className={'chip' + (m === 0 ? ' on' : '')}>Full year</Link>
        {MON3.map((n, i) => <Link key={n} href={href(i + 1)} className={'chip' + (m === i + 1 ? ' on' : '')}>{n}</Link>)}
      </div>

      <div className='kpis'>
        <div className='card kpi'><span>Budgeted, {m ? MONTHS[m - 1] : 'full year'}</span><b>{pkr(gb)}</b></div>
        <div className='card kpi alt'><span>Actual by Ops</span><b>{pkr(ga)}</b></div>
        <div className={'card kpi alt' + (gb - ga < 0 ? ' neg' : '')}><span>{gb - ga < 0 ? 'Over budget by' : 'Under budget by'}</span><b>{pkr(Math.abs(gb - ga))}</b></div>
      </div>

      <div className='card'>
        <div className='tablewrap'>
          <table className='tx er-grid'>
            <thead><tr><th>Expense</th><th className='r'>Budgeted</th><th className='r'>Actual by Ops</th><th className='r'>In QuickBooks</th><th className='r'>Variance</th></tr></thead>
            <tbody>
              {d.rows.map((r) => {
                const b = pick(r.b);
                const a = pick(r.a);
                const v = b - a;
                const cls = r.kind === 'total' ? 'er-main' : r.kind === 'grand' ? 'er-grand' : r.kind === 'head' && !b && !a ? 'er-head' : r.inside ? 'er-sub' : 'er-main';
                return (
                  <tr key={r.row} className={cls}>
                    <td className='c-title'>{r.inside ? <span className='er-ind'>{r.label}</span> : r.kind === 'total' || r.kind === 'grand' ? <b>{r.label}</b> : r.label}</td>
                    <td className='r nw c-meta'>{money(b)}</td>
                    <td className='r nw c-meta'>{money(a)}</td>
                    <td className='r nw c-meta'>{r.kind === 'total' || r.kind === 'grand' || r.kind === 'rest' ? '' : money(pick(r.q))}</td>
                    <td className={'r nw c-meta' + (v < -0.5 ? ' neg-t' : '')}>{r.kind === 'rest' ? '' : money(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
