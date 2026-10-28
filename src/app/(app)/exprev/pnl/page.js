import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { MON3, money, pnlView } from '@/lib/exprev';

export const dynamic = 'force-dynamic';

export default async function ExpRevPnl() {
  await requireUser(['om']);
  const p = await pnlView();
  if (!p.rows.length) {
    return (
      <>
        <div className='head'><div><h1>Profit and Loss</h1></div></div>
        <div className='card'>
          <p className='muted'>The profit and loss has not been loaded yet.</p>
          <Link href='/exprev/import' className='btn primary'>Load the workbook</Link>
        </div>
      </>
    );
  }
  return (
    <>
      <div className='head'>
        <div>
          <h1>Profit and Loss {p.year}</h1>
          <p className='muted'>{p.title.slice(1).join(', ')}. Consolidated for the Lahore and Islamabad offices, as set in the workbook.</p>
        </div>
      </div>
      <div className='card'>
        <div className='tablewrap'>
          <table className='tx er-grid'>
            <thead><tr><th>Account</th>{MON3.map((n) => <th key={n} className='r'>{n}</th>)}<th className='r'>Total</th></tr></thead>
            <tbody>
              {p.rows.map((r, i) => {
                const sum = r.vals.reduce((a, v) => a + (v || 0), 0);
                return (
                  <tr key={i} className={r.kind === 'total' ? 'er-main' : r.kind === 'head' ? 'er-head' : 'er-sub'}>
                    <td className='c-title'><span style={{ paddingLeft: r.level * 12 }}>{r.kind === 'total' ? <b>{r.label}</b> : r.label}</span></td>
                    {r.vals.map((v, j) => <td key={j} className='r nw c-meta'>{v === null ? '' : money(v)}</td>)}
                    <td className='r nw c-meta'>{r.kind === 'head' ? '' : <b>{money(sum)}</b>}</td>
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
