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
  // Default is year to date: January up to the last month that has spend, like the workbook's YTD block.
  const ytdTo = Math.max(1, d.closed || 1);
  let m = sp.m === undefined || sp.m === 'ytd' ? -2 : Number(sp.m);
  if (!(m >= 0 && m <= 12) && m !== -2) m = 0;
  // A range of months: from=..&to=.. (either way round); a single month or the full year is the same thing with both ends set.
  let from = m > 0 ? m : 1;
  let to = m > 0 ? m : m === -2 ? ytdTo : 12;
  if (sp.from !== undefined || sp.to !== undefined) {
    from = Math.min(12, Math.max(1, Number(sp.from) || 1));
    to = Math.min(12, Math.max(1, Number(sp.to) || 12));
    if (from > to) [from, to] = [to, from];
    m = from === to ? from : from === 1 && to === 12 ? 0 : -1;
  }
  const pick = (a) => a.slice(from - 1, to).reduce((x, y) => x + y, 0);
  // Months after the closed one have a budget only, so the variance looks at the closed months of the range.
  const pickC = (a) => a.slice(from - 1, Math.min(to, d.closed)).reduce((x, y) => x + y, 0);
  const span = from === to ? MONTHS[from - 1] : from === 1 && to === 12 ? 'full year' : m === -2 ? 'year to date (' + MON3[to - 1] + ')' : MONTHS[from - 1] + ' to ' + MONTHS[to - 1];
  const g = d.rows.find((r) => r.kind === 'grand2') || d.rows.find((r) => r.kind === 'grand');
  const gb = g ? pick(g.b) : 0;
  const gbc = g ? pickC(g.b) : 0;
  // Exactly the workbook's year-to-date range (January to the last worked month): use the workbook's own YTD figure.
  const isYtd = from === 1 && to === d.closed;
  const act = (r) => (isYtd && typeof r.ya === 'number' ? r.ya : pick(r.a));
  const ga = g ? act(g) : 0;
  // The two lines the workbook keeps under its final total: variance on the budgeted lines only, and with the non-budgeted ones too.
  const g1 = d.rows.find((r) => r.kind === 'grand');
  const varOf = (r) => (r ? pick(r.b) - act(r) : 0);
  const sumRows = [['Variance with Budgeted', varOf(g1)], ['Variance with Bud + Non-Bud', varOf(g)]].map(([label, v], i) => ({
    k: 'sum' + i,
    level: 0,
    cls: 'er-main',
    bold: true,
    label,
    cells: [{ t: '' }, { t: '' }, { t: '' }, { t: money(v), c: v < -0.5 ? 'neg-t' : v > 0.5 ? 'pos-t' : '', bold: true }],
  }));
  const href = (mm) => '/exprev/budget?m=' + mm;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Budget vs Actual</h1>
          <p className='muted'>{year}: as in the workbook. Up to {MONTHS[Math.max(1, d.closed) - 1]} the budget, actual by Ops and QuickBooks figures are the workbook's own; the months after show the budget only (what is still provided for). Variance is budget minus actual, so red means over budget.</p>
        </div>
      </div>

      <div className='inline er-months'>
        <Link href={href('ytd')} className={'chip' + (m === -2 ? ' on' : '')}>YTD</Link>
        <Link href={href(0)} className={'chip' + (m === 0 ? ' on' : '')}>Full year</Link>
        {MON3.map((n, i) => <Link key={n} href={href(i + 1)} className={'chip' + (m === i + 1 ? ' on' : '')}>{n}</Link>)}
      </div>

      <form method='get' className='er-range'>
        <label>From<select name='from' defaultValue={from} autoComplete='off'>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <label>To<select name='to' defaultValue={to} autoComplete='off'>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <button className='btn' type='submit'>Show</button>
      </form>

      <div className='kpis er-kpis'>
        <div className='card kpi'><span>Budgeted, {span}</span><b>{pkr(gb)}</b></div>
        <div className='card kpi alt'><span>Actual by Ops</span><b>{pkr(ga)}</b></div>
        <div className={'card kpi alt' + (gb - ga < 0 ? ' neg' : ' pos')}><span>{gb - ga < 0 ? 'Over budget by' : 'Budget left'}</span><b>{pkr(Math.abs(gb - ga))}</b></div>
      </div>

      <div className='card'>
        <OutlineTable
          head={[{ t: 'Expense' }, { t: 'Budgeted', r: true }, { t: 'Actual by Ops', r: true }, { t: 'In QuickBooks', r: true }, { t: 'Variance', r: true }]}
          rows={[...d.rows.map((r) => {
            const b = pick(r.b);
            const a = act(r);
            const v = b - a;
            const flat = r.kind === 'total' || r.kind === 'grand' || r.kind === 'grand2' || r.kind === 'rest' || r.kind === 'restitem';
            return {
              k: String(r.row),
              level: r.inside ? 1 : 0,
              cls: r.kind === 'total' ? 'er-main' : r.kind === 'grand' || r.kind === 'grand2' ? 'er-grand' : r.kind === 'head' && !b && !a ? 'er-head' : r.inside ? 'er-sub' : 'er-main',
              bold: r.kind === 'total' || r.kind === 'grand' || r.kind === 'grand2',
              label: r.label,
              cells: [{ t: money(b) }, { t: money(a) }, { t: r.kind === 'grand2' || r.kind === 'rest' || r.kind === 'restitem' ? '' : money(isYtd && typeof r.yq === 'number' ? r.yq : pick(r.q)) }, { t: r.kind === 'rest' || r.kind === 'restitem' ? '' : money(v), c: v < -0.5 ? 'neg-t' : v > 0.5 ? 'pos-t' : '' }],
            };
          }), ...sumRows]}
        />
      </div>
    </>
  );
}
