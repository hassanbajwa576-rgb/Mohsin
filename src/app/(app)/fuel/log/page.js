import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { todayKey, validDate, fmt12, fmtDay } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import { cards, fuelRows, fuelScope, canEditFuel, seesBalance, FUEL_KINDS, FKIND } from '@/lib/fuel';
import { deleteFuel } from '@/lib/fuel-actions';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const pkr = (n) => {
  const v = Number(n) || 0;
  const frac = Math.abs(v - Math.round(v)) > 0.004;
  return 'PKR ' + (frac ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));
};

export default async function FuelLogPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  if (!can(user, 'fuel_use')) redirect('/');
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  let from = validDate(sp.from || '') ? sp.from : addDay(to, -29);
  if (from > to) from = to;
  const asset = Number(sp.asset) || 0;
  const mgr = seesBalance(user);
  const kind = !mgr ? 'fill' : FKIND[sp.kind] ? sp.kind : '';
  const scope = await fuelScope(user);
  const list = await cards(scope);
  const rows = await fuelRows({ from, to, asset, kind, scope });
  const spent = rows.filter((r) => r.kind === 'fill').reduce((a, r) => a + r.amount, 0);
  const litres = rows.filter((r) => r.kind === 'fill').reduce((a, r) => a + (r.litres || 0), 0);
  const topups = rows.filter((r) => r.kind === 'topup').reduce((a, r) => a + r.amount, 0);
  const qs = new URLSearchParams({ from, to, ...(asset ? { asset: String(asset) } : {}), ...(kind ? { kind } : {}) }).toString();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Fuel Log</h1>
          <p className='muted'>Every fill and top-up, with what was spent and added in the period.</p>
        </div>
        <div className='inline'>
          <a href={'/fuel/log/xlsx?' + qs} className='btn primary'>Download Excel (.xlsx)</a>
        </div>
      </div>
      <Flash sp={sp} />

      <form method='get' className='card filters'>
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        <label>Card
          <select name='asset' defaultValue={asset || ''}><option value=''>All cards</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        {mgr ? (
          <label>What
            <select name='kind' defaultValue={kind}><option value=''>Everything</option>{FUEL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        ) : null}
        <button className='btn' type='submit'>Apply</button>
        <Link href='/fuel/log' className='btn ghost'>Reset</Link>
      </form>

      <div className='kpis'>
        <div className='card kpi'><span>Fuel bought</span><b>{pkr(spent)}</b><small>{litres ? Math.round(litres * 10) / 10 + ' litres' : 'Litres not recorded'}</small></div>
        {mgr ? <div className='card kpi alt'><span>Card top-ups</span><b>{pkr(topups)}</b></div> : null}
        <div className='card kpi alt'><span>Entries</span><b>{rows.length}</b></div>
      </div>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>When</th><th>Card</th><th>What</th><th className='r'>Amount</th><th>Litres</th><th>Meter</th><th>By</th><th></th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className='nw c-meta'>{fmtDay(t.at_ms)}, {fmt12(t.at_ms)}</td>
                    <td className='c-title'><b>{t.asset}</b></td>
                    <td className='c-meta'>{FKIND[t.kind]}{t.note ? <div className='muted'>{t.note}</div> : null}</td>
                    <td className='r nw c-meta'>{t.kind === 'fill' ? '- ' : '+ '}{pkr(t.amount)}</td>
                    <td className='c-meta'>{t.litres ? t.litres : '-'}</td>
                    <td className='c-meta'>{t.reading != null ? t.reading : '-'}</td>
                    <td className='c-meta'>{t.by_name || '-'}</td>
                    <td className='act'>
                      {canEditFuel(user, t) ? <Link className='btn' href={'/fuel/edit?id=' + t.id}>Edit</Link> : null}
                      {user.role === 'om' ? (
                        <form action={deleteFuel} className='inline'>
                          <input type='hidden' name='id' value={t.id} />
                          <ConfirmButton className='btn ghost' message='Remove this entry?'>Remove</ConfirmButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No entries for these filters.</p>}
      </div>
    </>
  );
}