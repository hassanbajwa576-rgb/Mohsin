import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import OutlineTable from '@/components/OutlineTable';
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
        <OutlineTable
          head={[{ t: 'Account' }, ...MON3.map((n) => ({ t: n, r: true })), { t: 'Total', r: true }]}
          rows={p.rows.map((r, i) => ({
            k: r.label + i,
            level: r.level,
            cls: r.kind === 'total' ? 'er-main' : r.kind === 'head' ? 'er-head' : 'er-sub',
            bold: r.kind === 'total',
            label: r.label,
            cells: [...r.vals.map((v) => ({ t: v === null ? '' : money(v) })), { t: r.kind === 'head' ? '' : money(r.vals.reduce((a, v) => a + (v || 0), 0)), bold: true }],
          }))}
        />
      </div>
    </>
  );
}
