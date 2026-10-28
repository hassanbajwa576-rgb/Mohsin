import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import { MONTHS, MON3, money, pkr, erYears, officeCosts, sharedHeads, headcount, budgetByHead } from '@/lib/exprev';
import { saveSharedHeads } from '@/lib/exprev-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const LHR = '#BA7517';
const ISB = '#185FA5';
// One decimal; a share under 0.1% but above zero shows two, so a small spend never reads 0.0%.
const pct = (a, b) => {
  if (!b) return '-';
  const v = (a / b) * 100;
  return (v > 0 && v < 0.1 ? v.toFixed(2) : v.toFixed(1)) + '%';
};
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
  const [rows, shared, hc] = await Promise.all([officeCosts(y), sharedHeads(), headcount()]);
  // Shared heads (BOLDBelief, Bank Fees) are divided by headcount: each office carries its share of the employees.
  const sharedSet = new Set(shared);
  const hcTotal = hc.LHR + hc.ISB;
  // BOLDBelief is not an operating cost: this switch leaves it out of every figure on the page.
  const noBB = sp.bb === 'no';
  const isBB = (cc) => /^boldbelief/i.test(String(cc || '').trim());
  const alloc = sp.al !== 'raw' && hcTotal > 0 && shared.length > 0;
  const wL = hcTotal ? hc.LHR / hcTotal : 0;
  const wI = hcTotal ? hc.ISB / hcTotal : 0;
  const allHeads = [...new Set(rows.map((r) => r.cc).filter(Boolean))].sort();
  const lastWith = rows.reduce((a, r) => Math.max(a, r.m), 0) || 1;
  const ytd = sp.p === 'ytd';
  // Months shown: the quick choice (all, or year to date), or a From and To month picked by hand.
  let from = 1;
  let to = ytd ? lastWith : 12;
  if (sp.f !== undefined || sp.t !== undefined) {
    from = Math.min(12, Math.max(1, Number(sp.f) || 1));
    to = Math.min(12, Math.max(1, Number(sp.t) || 12));
    if (from > to) [from, to] = [to, from];
  }
  const span = to - from + 1;
  const lhr = Array(12).fill(0);
  const isb = Array(12).fill(0);
  const heads = new Map();
  for (const r of rows) {
    if (r.m < from || r.m > to) continue;
    if (noBB && isBB(r.cc)) continue;
    const k = r.cc || '(no cost center)';
    const h = heads.get(k) || { cc: k, lhr: 0, isb: 0 };
    if (alloc && sharedSet.has(r.cc)) {
      lhr[r.m - 1] += r.s * wL;
      isb[r.m - 1] += r.s * wI;
      h.lhr += r.s * wL;
      h.isb += r.s * wI;
    } else {
      (r.o === 'ISB' ? isb : lhr)[r.m - 1] += r.s;
      h[r.o === 'ISB' ? 'isb' : 'lhr'] += r.s;
    }
    heads.set(k, h);
  }
  // Budget for the same months (the workbook has no budget per office, so only the total is compared).
  const bud = await budgetByHead(y);
  let bT = 0;
  for (const [cc, arr] of Object.entries(bud)) {
    if (noBB && isBB(cc)) continue;
    bT += arr.slice(from - 1, to).reduce((a, v) => a + v, 0);
  }
  const sum = (a) => a.reduce((x, v) => x + v, 0);
  const tL = sum(lhr);
  const tI = sum(isb);
  const T = tL + tI;
  // The same months and switches for each year, to compare year with year (latest four years with entries).
  const tally = (rs) => {
    const l = Array(12).fill(0);
    const i = Array(12).fill(0);
    const hd = new Map();
    for (const r of rs) {
      if (r.m < from || r.m > to) continue;
      if (noBB && isBB(r.cc)) continue;
      const k = r.cc || '(no cost center)';
      const h = hd.get(k) || { lhr: 0, isb: 0 };
      if (alloc && sharedSet.has(r.cc)) {
        l[r.m - 1] += r.s * wL;
        i[r.m - 1] += r.s * wI;
        h.lhr += r.s * wL;
        h.isb += r.s * wI;
      } else {
        (r.o === 'ISB' ? i : l)[r.m - 1] += r.s;
        h[r.o === 'ISB' ? 'isb' : 'lhr'] += r.s;
      }
      hd.set(k, h);
    }
    return { l, i, hd, tl: sum(l), ti: sum(i), tot: sum(l) + sum(i) };
  };
  const tallies = await Promise.all(years.slice(0, 4).map(async (yy) => ({ y: yy, ...tally(yy === y ? rows : await officeCosts(yy)) })));
  const YR = tallies.filter((x) => x.tot > 0).sort((a, b) => a.y - b.y);
  const YC = ['#7a8a99', '#185FA5', '#BA7517', '#8a4fb0'].slice(-Math.max(YR.length, 1));
  const chg = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
  const Chg = ({ cur, prev }) => {
    const v = chg(cur, prev);
    if (v === null) return <span>-</span>;
    return <span className={v > 0.05 ? 'an-over' : v < -0.05 ? 'an-left' : ''}>{(v > 0 ? '+' : '') + v.toFixed(1)}%</span>;
  };
  const cm = to - from + 1;
  const gw = 600 / cm;
  const bwY = Math.min(26, (gw * 0.8) / Math.max(YR.length, 1));
  const maxY = Math.max(1, ...YR.flatMap((x) => x.l.map((v, i) => v + x.i[i])));
  const headNames = [...new Set(YR.flatMap((x) => [...x.hd.keys()]))];
  const latest = YR[YR.length - 1];
  const prevY = YR.length > 1 ? YR[YR.length - 2] : null;
  const headRows = headNames.map((k) => ({ k, vals: YR.map((x) => (x.hd.get(k) ? x.hd.get(k).lhr + x.hd.get(k).isb : 0)) })).sort((a, b) => (b.vals[b.vals.length - 1] || 0) - (a.vals[a.vals.length - 1] || 0));
  const list = [...heads.values()].map((h) => ({ ...h, tot: h.lhr + h.isb })).sort((a, b) => b.tot - a.tot);
  const topN = list;
  const maxM = Math.max(1, ...lhr.map((v, i) => v + isb[i]));
  const maxH = Math.max(1, ...topN.map((h) => h.tot));
  const href = (yy, p) => '/exprev/analysis?' + new URLSearchParams({ y: String(yy), ...(p ? { p } : {}), ...(sp.al === 'raw' ? { al: 'raw' } : {}), ...(noBB ? { bb: 'no' } : {}) }).toString();
  const alHref = (al) => '/exprev/analysis?' + new URLSearchParams({ y: String(y), ...(sp.p ? { p: sp.p } : {}), ...(sp.f ? { f: sp.f } : {}), ...(sp.t ? { t: sp.t } : {}), ...(al ? { al } : {}), ...(noBB ? { bb: 'no' } : {}) }).toString();
  const bbHref = (bb) => '/exprev/analysis?' + new URLSearchParams({ y: String(y), ...(sp.p ? { p: sp.p } : {}), ...(sp.f ? { f: sp.f } : {}), ...(sp.t ? { t: sp.t } : {}), ...(sp.al === 'raw' ? { al: 'raw' } : {}), ...(bb ? { bb } : {}) }).toString();
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
      <Flash sp={sp} />
      <div className='an-filters'>
        <div className='inline er-months'>
          <Link href={href(y, '')} className={'chip' + (!ytd && sp.f === undefined && sp.t === undefined ? ' on' : '')}>All months</Link>
          <Link href={href(y, 'ytd')} className={'chip' + (ytd && sp.f === undefined && sp.t === undefined ? ' on' : '')}>YTD ({MON3[lastWith - 1]})</Link>
        </div>
        <div className='inline er-months'>
          <Link href={bbHref('')} className={'chip' + (!noBB ? ' on' : '')}>With BOLDBelief</Link>
          <Link href={bbHref('no')} className={'chip' + (noBB ? ' on' : '')} title='BOLDBelief is not an operating cost'>Without BOLDBelief</Link>
        </div>
        <div className='inline er-months'>
          <Link href={alHref('')} className={'chip' + (alloc ? ' on' : '')} title='Shared heads are divided between the offices by employees'>Split by headcount</Link>
          <Link href={alHref('raw')} className={'chip' + (!alloc ? ' on' : '')} title='Each cost stays with the office written on its entry'>As booked</Link>
        </div>
        <div className='inline er-months'>
          <a href='#year-by-year' className='chip'>Year by year ↓</a>
        </div>
      </div>
      {noBB ? <p className='muted' style={{ margin: '0 0 6px', fontSize: 13 }}>BOLDBelief is left out of every figure below.</p> : null}
      {alloc ? <p className='muted' style={{ margin: '0 0 12px', fontSize: 13 }}>{shared.filter((h) => !(noBB && isBB(h))).join(' and ')} {shared.length > 1 ? 'are' : 'is'} divided by employees: LHR {hc.LHR} ({pct(hc.LHR, hcTotal)}), ISB {hc.ISB} ({pct(hc.ISB, hcTotal)}). Headcount is the active staff in the Attendance list, today's number for every month.</p> : <p className='muted' style={{ margin: '0 0 12px', fontSize: 13 }}>Every cost is shown against the office written on its entry.</p>}

      <form method='get' className='er-range'>
        <input type='hidden' name='y' value={y} />
        {sp.al === 'raw' ? <input type='hidden' name='al' value='raw' /> : null}
        {noBB ? <input type='hidden' name='bb' value='no' /> : null}
        <label>From month<select name='f' defaultValue={from} autoComplete='off'>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <label>To month<select name='t' defaultValue={to} autoComplete='off'>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <button className='btn' type='submit'>Show</button>
      </form>

      <div className='kpis er-kpis er-kpis5'>
        <div className='card kpi'><span>Budgeted{noBB ? ' (without BOLDBelief)' : ''}</span><b>{pkr(bT)}</b><small><span className={bT - T >= 0 ? 'an-left' : 'an-over'}>{bT - T >= 0 ? 'Left: ' : 'Over by: '}{pkr(Math.abs(bT - T))}</span></small></div>
        <div className='card kpi alt'><span>Total cost</span><b>{pkr(T)}</b><small>Actual spend</small></div>
        <div className='card kpi alt'><span>LHR cost</span><b>{pkr(tL)}</b><small>{pct(tL, T)} of total</small></div>
        <div className='card kpi alt'><span>ISB cost</span><b>{pkr(tI)}</b><small>{pct(tI, T)} of total</small></div>
        <div className='card kpi alt'><span>Average a month</span><b>{pkr(T / Math.max(1, span))}</b><small>ISB {pkr(tI / Math.max(1, span))}</small></div>
      </div>

      <div className='card'>
        <h3>Month by month: LHR and ISB</h3>
        <div className='an-leg'><span><i style={{ background: LHR }} />LHR</span><span><i style={{ background: ISB }} />ISB</span></div>
        <svg className='an-chart' viewBox='0 0 640 180' role='img' aria-label='Monthly cost, LHR and ISB'>
          {MON3.map((n, i) => {
            const x = 28 + i * (bw + gap);
            const hl = (lhr[i] / maxM) * 130;
            const hi = (isb[i] / maxM) * 130;
            const on = i >= from - 1 && i < to;
            return (
              <g key={n} opacity={on ? 1 : 0.35}>
                <rect x={x} y={150 - hl} width={bw} height={hl} rx='2' fill={LHR} />
                <rect x={x} y={150 - hl - hi} width={bw} height={hi} rx='2' fill={ISB} />
                {on && lhr[i] > 0 && hl >= 12 ? <text x={x + bw / 2} y={150 - hl / 2 + 3.5} textAnchor='middle' className='an-in'>{pct(lhr[i], lhr[i] + isb[i])}</text> : null}
                {on && isb[i] > 0 && hi >= 12 ? <text x={x + bw / 2} y={150 - hl - hi / 2 + 3.5} textAnchor='middle' className='an-in'>{pct(isb[i], lhr[i] + isb[i])}</text> : null}
                {on && isb[i] > 0 && hi < 12 ? <text x={x + bw / 2} y={146 - hl - hi} textAnchor='middle' className='an-t an-isb'>{pct(isb[i], lhr[i] + isb[i])}</text> : null}
                {on && lhr[i] + isb[i] > 0 ? <text x={x + bw / 2} y={(hi < 12 && isb[i] > 0 ? 134 : 146) - hl - hi} textAnchor='middle' className='an-t'>{mil(lhr[i] + isb[i])}</text> : null}
                <text x={x + bw / 2} y={168} textAnchor='middle' className='an-t'>{n}</text>
              </g>
            );
          })}
          <line x1='22' y1='150' x2='636' y2='150' stroke='currentColor' opacity='.2' />
        </svg>
        <p className='muted' style={{ margin: '4px 0 0', fontSize: 12 }}>Above each bar: the month's total. Inside the bar: LHR share (brown) and ISB share (blue). A thin ISB slice shows its share just above the bar.</p>
      </div>

      <div className='card'>
        <h3>By head: total cost and share</h3>
        <div className='an-leg'><span><i style={{ background: LHR }} />LHR</span><span><i style={{ background: ISB }} />ISB</span></div>
        <div className='an-row an-head'>
          <span>Head</span>
          <span />
          <span>Total cost</span>
          <span>% of total</span>
          <span className='an-lhr'>LHR %</span>
          <span className='an-isb'>ISB %</span>
        </div>
        {topN.map((h) => (
          <div key={h.cc} className='an-row'>
            <span className='an-name'>{h.cc}</span>
            <div className='an-bar'>
              <div style={{ width: (h.lhr / maxH) * 100 + '%', background: LHR }} />
              <div style={{ width: (h.isb / maxH) * 100 + '%', background: ISB }} />
            </div>
            <span className='an-n an-tot'><span className='er-cl'>Total cost</span><b>{money(h.tot)}</b></span>
            <span className='an-n'><span className='er-cl'>% of total</span>{pct(h.tot, T)}</span>
            <span className='an-n an-lhr'><span className='er-cl'>LHR %</span>{pct(h.lhr, h.tot)}</span>
            <span className='an-n an-isb'><span className='er-cl'>ISB %</span>{pct(h.isb, h.tot)}</span>
          </div>
        ))}
      </div>

      <div className='card'>
        <h3>Month by month in numbers</h3>
        <div className='tablewrap'>
          <table className='tx an-tbl'>
            <thead><tr><th>Month</th><th className='r'>LHR</th><th className='r'>ISB</th><th className='r'>Total</th><th className='r'>LHR %</th><th className='r'>ISB %</th></tr></thead>
            <tbody>
              {MONTHS.map((n, i) => i < from - 1 || i >= to ? null : (
                <tr key={n}>
                  <td className='c-title'>{n}</td>
                  <td className='r nw c-meta'><span className='er-cl'>LHR</span>{money(lhr[i])}</td>
                  <td className='r nw c-meta'><span className='er-cl'>ISB</span>{money(isb[i])}</td>
                  <td className='r nw c-meta'><span className='er-cl'>Total</span><b>{money(lhr[i] + isb[i])}</b></td>
                  <td className='r nw c-meta'><span className='er-cl'>LHR %</span>{pct(lhr[i], lhr[i] + isb[i])}</td>
                  <td className='r nw c-meta'><span className='er-cl'>ISB %</span>{pct(isb[i], lhr[i] + isb[i])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td className='r nw'><span className='er-cl'>LHR</span>{money(tL)}</td><td className='r nw'><span className='er-cl'>ISB</span>{money(tI)}</td><td className='r nw'><span className='er-cl'>Total</span>{money(T)}</td><td className='r nw'><span className='er-cl'>LHR %</span>{pct(tL, T)}</td><td className='r nw'><span className='er-cl'>ISB %</span>{pct(tI, T)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      {YR.length > 1 ? (
        <div className='card' id='year-by-year'>
          <h3>Year by year: {MONTHS[from - 1]} to {MONTHS[to - 1]}</h3>
          <p className='muted' style={{ margin: '0 0 8px', fontSize: 12.5 }}>The same months in each year, with the same switches as above. Red means spending went up on the year before, green means it went down.</p>
          <div className='tablewrap'>
            <table className='tx an-tbl'>
              <thead><tr><th>Year</th><th className='r'>Total</th><th className='r'>LHR</th><th className='r'>ISB</th><th className='r'>ISB %</th><th className='r'>Change</th></tr></thead>
              <tbody>
                {YR.map((x, k) => (
                  <tr key={x.y}>
                    <td className='c-title'><i className='an-dot' style={{ background: YC[k] }} />{x.y}</td>
                    <td className='r nw c-meta'><span className='er-cl'>Total</span><b>{money(x.tot)}</b></td>
                    <td className='r nw c-meta'><span className='er-cl'>LHR</span>{money(x.tl)}</td>
                    <td className='r nw c-meta'><span className='er-cl'>ISB</span>{money(x.ti)}</td>
                    <td className='r nw c-meta'><span className='er-cl'>ISB %</span>{pct(x.ti, x.tot)}</td>
                    <td className='r nw c-meta'><span className='er-cl'>Change</span>{k ? <Chg cur={x.tot} prev={YR[k - 1].tot} /> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4 className='an-sub'>Month by month</h4>
          <div className='an-leg'>{YR.map((x, k) => <span key={x.y}><i style={{ background: YC[k] }} />{x.y}</span>)}</div>
          <svg className='an-chart' viewBox='0 0 640 190' role='img' aria-label='Monthly cost for each year'>
            {Array.from({ length: cm }, (_, n) => {
              const m = from - 1 + n;
              const gx = 20 + n * gw;
              return (
                <g key={m}>
                  {YR.map((x, k) => {
                    const v = x.l[m] + x.i[m];
                    const h = (v / maxY) * 140;
                    return <rect key={x.y} x={gx + (gw - bwY * YR.length) / 2 + k * bwY} y={160 - h} width={Math.max(2, bwY - 2)} height={h} rx='2' fill={YC[k]} />;
                  })}
                  <text x={gx + gw / 2} y={178} textAnchor='middle' className='an-t'>{MON3[m]}</text>
                </g>
              );
            })}
            <line x1='14' y1='160' x2='636' y2='160' stroke='currentColor' opacity='.2' />
          </svg>

          <h4 className='an-sub'>By head</h4>
          <div className='tablewrap'>
            <table className='tx an-tbl'>
              <thead><tr><th>Head</th>{YR.map((x) => <th key={x.y} className='r'>{x.y}</th>)}<th className='r'>Change</th></tr></thead>
              <tbody>
                {headRows.map((h) => (
                  <tr key={h.k}>
                    <td className='c-title'>{h.k}</td>
                    {h.vals.map((v, k) => <td key={k} className='r nw c-meta'><span className='er-cl'>{YR[k].y}</span>{money(v)}</td>)}
                    <td className='r nw c-meta'><span className='er-cl'>Change</span>{prevY ? <Chg cur={h.vals[h.vals.length - 1]} prev={h.vals[h.vals.length - 2]} /> : '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Total</td>{YR.map((x) => <td key={x.y} className='r nw'><span className='er-cl'>{x.y}</span>{money(x.tot)}</td>)}<td className='r nw'><span className='er-cl'>Change</span>{prevY ? <Chg cur={latest.tot} prev={prevY.tot} /> : '-'}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className='card' id='year-by-year'>
          <h3>Year by year</h3>
          <p className='muted'>There are no entries in {MONTHS[from - 1]} to {MONTHS[to - 1]} for a second year to compare with.</p>
        </div>
      )}

      <details className='card'>
        <summary><b>Shared heads</b> <span className='muted'>({shared.length}): costs split between the offices by headcount</span></summary>
        <form action={saveSharedHeads} className='form' style={{ marginTop: 10 }}>
          <div className='wide an-checks'>
            {allHeads.map((h) => <label key={h} className='an-check'><input type='checkbox' name='h' value={h} defaultChecked={sharedSet.has(h)} />{h}</label>)}
          </div>
          <button className='btn primary' type='submit'>Save shared heads</button>
        </form>
      </details>
    </>
  );
}
