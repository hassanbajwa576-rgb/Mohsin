import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import OutlineTable from '@/components/OutlineTable';
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
  // A range of months: from=..&to=.. (either way round); a single month or the full year is the same thing with both ends set.
  let from = m || 1;
  let to = m || 12;
  if (sp.from !== undefined || sp.to !== undefined) {
    from = Math.min(12, Math.max(1, Number(sp.from) || 1));
    to = Math.min(12, Math.max(1, Number(sp.to) || 12));
    if (from > to) [from, to] = [to, from];
    m = from === to ? from : from === 1 && to === 12 ? 0 : -1;
  }
  const pick = (a) => a.slice(from - 1, to).reduce((x, y) => x + y, 0);
  const span = from === to ? MONTHS[from - 1] : from === 1 && to === 12 ? 'full year' : MONTHS[from - 1] + ' to ' + MONTHS[to - 1];
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

      <form method='get' className='er-range'>
        <label>From<select name='from' defaultValue={from}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <label>To<select name='to' defaultValue={to}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <button className='btn' type='submit'>Show</button>
      </form>

      <div className='kpis'>
        <div className='card kpi'><span>Budgeted, {span}</span><b>{pkr(gb)}</b></div>
        <div className='card kpi alt'><span>Actual by Ops</span><b>{pkr(ga)}</b></div>
        <div className={'card kpi alt' + (gb - ga < 0 ? ' neg' : ' pos')}><span>{gb - ga < 0 ? 'Over budget by' : 'Under budget by'}</span><b>{pkr(Math.abs(gb - ga))}</b></div>
      </div>

      <div className='card'>
        <OutlineTable
          head={[{ t: 'Expense' }, { t: 'Budgeted', r: true }, { t: 'Actual by Ops', r: true }, { t: 'In QuickBooks', r: true }, { t: 'Variance', r: true }]}
          rows={d.rows.map((r) => {
            const b = pick(r.b);
            const a = pick(r.a);
            const v = b - a;
            const flat = r.kind === 'total' || r.kind === 'grand' || r.kind === 'rest';
            return {
              k: String(r.row),
              level: r.inside ? 1 : 0,
              cls: r.kind === 'total' ? 'er-main' : r.kind === 'grand' ? 'er-grand' : r.kind === 'head' && !b && !a ? 'er-head' : r.inside ? 'er-sub' : 'er-main',
              bold: r.kind === 'total' || r.kind === 'grand',
              label: r.label,
              cells: [{ t: money(b) }, { t: money(a) }, { t: flat ? '' : money(pick(r.q)) }, { t: r.kind === 'rest' ? '' : money(v), c: v < -0.5 ? 'neg-t' : v > 0.5 ? 'pos-t' : '' }],
            };
          })}
        />
      </div>
    </>
  );
}
