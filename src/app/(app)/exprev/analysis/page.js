import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import { MONTHS, MON3, money, pkr, erYears, officeCosts } from '@/lib/exprev';

export const dynamic = 'force-dynamic';

const LHR = '#BA7517';
const ISB = '#185FA5';
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
const mil = (v) => (v / 1e6).toFixed(1) + 'M';

// Cost analysis: total, LHR and ISB (a blank office in the sheet means LHR), by month and by head, with percentages.
export default async function ExpRevAnalysis({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const years = await erYears();
  if (!years.length) {
    return (
      <>
        <div className='head'><div><h1>Analysis</h1></div></div>
        <div className='card'><p className='muted'>Load the workbook first.</p><Link href='/exprev/import' className='btn primary'>Load the workbook</Link></div>
      </>
    );
  }
  const today = todayKey();
  const y = years.includes(Number(sp.y)) ? Number(sp.y) : years.includes(Number(today.slice(0, 4))) ? Number(today.slice(0, 4)) : years[0];
  const rows = await officeCosts(y);
  const lastWith = rows.reduce((a, r) => Math.max(a, r.m), 0) || 1;
  const ytd = sp.p === 'ytd';
  const to = ytd ? lastWith : 12;
  const lhr = Array(12).fill(0);
  const isb = Array(12).fill(0);
  const heads = new Map();
  for (const r of rows) {
    if (r.m > to) continue;
    (r.o === 'ISB' ? isb : lhr)[r.m - 1] += r.s;
    const k = r.cc || '(no cost center)';
    const h = heads.get(k) || { cc: k, lhr: 0, isb: 0 };
    h[r.o === 'ISB' ? 'isb' : 'lhr'] += r.s;
    heads.set(k, h);
  }
  const sum = (a) => a.reduce((x, v) => x + v, 0);
  const tL = sum(lhr);
  const tI = sum(isb);
  const T = tL + tI;
  const list = [...heads.values()].map((h) => ({ ...h, tot: h.lhr + h.isb })).sort((a, b) => b.tot - a.tot);
  const topN = list.slice(0, 12);
  const maxM = Math.max(1, ...lhr.map((v, i) => v + isb[i]));
  const maxH = Math.max(1, ...topN.map((h) => h.tot));
  const href = (yy, p) => '/exprev/analysis?y=' + yy + (p ? '&p=' + p : '');
  const bw = 34;
  const gap = 14;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Analysis</h1>
          <p className='muted'>What was spent, split by office and by head. Entries with no office are counted as LHR.</p>
        </div>
        <div className='inline'>
          {years.map((yy) => <Link key={yy} href={href(yy, sp.p)} className={'chip' + (yy === y ? ' on' : '')}>{yy}</Link>)}
        </div>
      </div>
      <div className='inline er-months'>
        <Link href={href(y, '')} className={'chip' + (!ytd ? ' on' : '')}>All months</Link>
        <Link href={href(y, 'ytd')} className={'chip' + (ytd ? ' on' : '')}>Year to date ({MON3[lastWith - 1]})</Link>
      </div>

      <div className='kpis er-kpis er-kpis4'>
        <div className='card kpi'><span>Total cost</span><b>{pkr(T)}</b><small>100%</small></div>
        <div className='card kpi alt'><span>LHR cost</span><b>{pkr(tL)}</b><small>{pct(tL, T)} of total</small></div>
        <div className='card kpi alt'><span>ISB cost</span><b>{pkr(tI)}</b><small>{pct(tI, T)} of total</small></div>
        <div className='card kpi alt'><span>Average a month</span><b>{pkr(T / Math.max(1, to))}</b><small>ISB {pkr(tI / Math.max(1, to))}</small></div>
      </div>

      <div className='card'>
        <h3>Month by month: LHR and ISB</h3>
        <div className='an-leg'><span><i style={{ background: LHR }} />LHR</span><span><i style={{ background: ISB }} />ISB</span></div>
        <svg className='an-chart' viewBox='0 0 640 200' role='img' aria-label='Monthly cost, LHR and ISB'>
          {MON3.map((n, i) => {
            const x = 28 + i * (bw + gap);
            const hl = (lhr[i] / maxM) * 130;
            const hi = (isb[i] / maxM) * 130;
            const on = i < to;
            return (
              <g key={n} opacity={on ? 1 : 0.35}>
                <rect x={x} y={150 - hl} width={bw} height={hl} rx='2' fill={LHR} />
                <rect x={x} y={150 - hl - hi} width={bw} height={hi} rx='2' fill={ISB} />
                {on && lhr[i] + isb[i] > 0 ? <text x={x + bw / 2} y={146 - hl - hi} textAnchor='middle' className='an-t'>{mil(lhr[i] + isb[i])}</text> : null}
                {on && isb[i] > 0 ? <text x={x + bw / 2} y={170} textAnchor='middle' className='an-t an-isb'>{pct(isb[i], lhr[i] + isb[i])}</text> : null}
                <text x={x + bw / 2} y={186} textAnchor='middle' className='an-t'>{n}</text>
              </g>
            );
          })}
          <line x1='22' y1='150' x2='636' y2='150' stroke='currentColor' opacity='.2' />
        </svg>
        <p className='muted' style={{ margin: '4px 0 0', fontSize: 12 }}>Above each bar: the month's total. Below it, in blue: the ISB share of that month.</p>
      </div>

      <div className='card'>
        <h3>By head: total cost and share</h3>
        <div className='an-leg'><span><i style={{ background: LHR }} />LHR</span><span><i style={{ background: ISB }} />ISB</span></div>
        {topN.map((h) => (
          <div key={h.cc} className='an-row'>
            <span className='an-name'>{h.cc}</span>
            <div className='an-bar'>
              <div style={{ width: (h.lhr / maxH) * 100 + '%', background: LHR }} />
              <div style={{ width: (h.isb / maxH) * 100 + '%', background: ISB }} />
            </div>
            <span className='an-num'><b>{mil(h.tot)}</b> <small>{pct(h.tot, T)}</small><small className='an-isb'> ISB {pct(h.isb, h.tot)}</small></span>
          </div>
        ))}
        {list.length > topN.length ? <p className='muted' style={{ margin: '6px 0 0', fontSize: 12 }}>The {list.length - topN.length} smaller heads are not shown.</p> : null}
      </div>

      <div className='card'>
        <h3>Month by month in numbers</h3>
        <div className='tablewrap'>
          <table className='tx'>
            <thead><tr><th>Month</th><th className='r'>LHR</th><th className='r'>ISB</th><th className='r'>Total</th><th className='r'>ISB share</th></tr></thead>
            <tbody>
              {MONTHS.slice(0, to).map((n, i) => (
                <tr key={n}>
                  <td className='c-title'>{n}</td>
                  <td className='r nw c-meta'>{money(lhr[i])}</td>
                  <td className='r nw c-meta'>{money(isb[i])}</td>
                  <td className='r nw c-meta'><b>{money(lhr[i] + isb[i])}</b></td>
                  <td className='r nw c-meta'>{pct(isb[i], lhr[i] + isb[i])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className='r nw'>{money(tL)}</td><td className='r nw'>{money(tI)}</td><td className='r nw'>{money(T)}</td><td className='r nw'>{pct(tI, T)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
