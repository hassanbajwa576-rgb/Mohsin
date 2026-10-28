import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import { MONTHS, MON3, money, pkr, erYears, erStatus, dashboard } from '@/lib/exprev';
import Flash from '@/components/Flash';
import XlTable from '@/components/XlTable';

export const dynamic = 'force-dynamic';

const rs = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-US');
function XlRow({ r, cls, m }) {
  return (
    <tr className={cls}>
      <th scope='row'>{r.label}</th>
      {r.vals.map((v, i) => <td key={i} className={i + 1 === m ? 'xl-sel' : ''}>{rs(v)}</td>)}
      <td>{rs(r.vals.reduce((a, v) => a + v, 0))}</td>
    </tr>
  );
}

export default async function ExpRevDashboard({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const [years, status] = await Promise.all([erYears(), erStatus()]);
  if (!status.entries) {
    return (
      <>
        <div className='head'>
          <div>
            <h1>ExpRev</h1>
            <p className='muted'>Expenditure review: monthly and yearly totals, budget against actual, and the profit and loss.</p>
          </div>
        </div>
        <Flash sp={sp} />
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Nothing loaded yet</h3>
          <p className='muted'>Load the Ops Expenses Dashboard workbook once to fill ExpRev with your expenditure list, budget and profit and loss.</p>
          <Link href='/exprev/import' className='btn primary'>Load the workbook</Link>
        </div>
      </>
    );
  }
  const today = todayKey();
  const y = years.includes(Number(sp.y)) ? Number(sp.y) : years.includes(Number(today.slice(0, 4))) ? Number(today.slice(0, 4)) : years[0];
  const d = await dashboard(y);
  let m = Number(sp.m);
  if (!(m >= 1 && m <= 12)) {
    const last = d.month.reduce((a, v, i) => (v ? i + 1 : a), 0);
    m = y === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) : last || 1;
  }
  const max = Math.max(...d.month, 1);
  const qs = (yy, mm) => '/exprev?y=' + yy + '&m=' + mm;
  const top = d.main.filter((r) => r.vals[m - 1] > 0).sort((a, b) => b.vals[m - 1] - a.vals[m - 1]).slice(0, 6);
  const prev = m > 1 ? d.month[m - 2] : 0;
  const diff = prev ? ((d.month[m - 1] - prev) / prev) * 100 : null;

  return (
    <>
      <div className='head'>
        <div>
          <h1>ExpRev</h1>
          <p className='muted'>Expenditure review for AlphaBOLD Pakistan. {status.entries.toLocaleString('en-US')} entries, {status.first} to {status.last}.</p>
        </div>
        <div className='inline'>
          {years.map((yy) => <Link key={yy} href={qs(yy, m)} className={'chip' + (yy === y ? ' on' : '')}>{yy}</Link>)}
        </div>
      </div>
      <Flash sp={sp} />

      <div className='kpis er-kpis'>
        <div className='card kpi'><span>{MONTHS[m - 1]} {y}</span><b>{pkr(d.month[m - 1])}</b>{diff !== null ? <small>{diff >= 0 ? 'Up ' : 'Down '}{Math.abs(diff).toFixed(0)}% on {MONTHS[m - 2]}</small> : null}</div>
        <div className='card kpi alt'><span>Total for {y}</span><b>{pkr(d.year)}</b><small>All months with entries</small></div>
        <div className='card kpi alt'><span>Average a month</span><b>{pkr(d.year / Math.max(1, d.month.filter((v) => v).length))}</b><small>Months with entries</small></div>
      </div>

      <div className='card'>
        <h3>Month by month</h3>
        <div className='er-bars' role='list'>
          {d.month.map((v, i) => (
            <Link key={i} href={qs(y, i + 1)} className={'er-bar' + (i + 1 === m ? ' on' : '')} role='listitem' title={MONTHS[i] + ': ' + pkr(v)}>
              <span className='er-fill' style={{ height: Math.max(v ? 4 : 0, Math.round((v / max) * 100)) + '%' }} />
              <i>{MON3[i]}</i>
            </Link>
          ))}
        </div>
      </div>

      {top.length ? (
        <div className='card'>
          <h3>Where {MONTHS[m - 1]} went</h3>
          <div className='er-top'>
            {top.map((r) => (
              <div key={r.label} className='er-toprow'>
                <span>{r.label}</span>
                <span className='er-track'><span style={{ width: Math.round((r.vals[m - 1] / top[0].vals[m - 1]) * 100) + '%' }} /></span>
                <b>{money(r.vals[m - 1])}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className='card'>
        <h3>All categories, {y}</h3>
        <XlTable
          months={MONTHS}
          hrefs={MONTHS.map((_, i) => qs(y, i + 1))}
          m={m}
          rows={[
            ...d.main.map((r, k) => ({ ...r, cls: k % 2 ? 'xl-b' : 'xl-a' })),
            { label: 'Total Expenses', vals: d.mainTotal, cls: 'xl-tot' },
            { label: 'gap', gap: true },
            ...d.extras.map((r, k) => ({ ...r, cls: k ? 'xl-ven' : 'xl-adv' })),
            { label: 'Grand total', vals: d.month, cls: 'xl-grand' },
          ]}
        />
      </div>
    </>
  );
}
