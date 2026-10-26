import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { todayKey, fmtTime, fmt12, fmtDay } from '@/lib/att';
import { cards, recentFuel, fuelScope, seesBalance, FUEL_KINDS, FKIND } from '@/lib/fuel';
import { addFuel } from '@/lib/fuel-actions';
import Flash from '@/components/Flash';
import CountUp from '@/components/CountUp';

export const dynamic = 'force-dynamic';

const pkr = (n) => {
  const v = Number(n) || 0;
  const frac = Math.abs(v - Math.round(v)) > 0.004;
  return 'PKR ' + (frac ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));
};

// Fuel cards for the genset and the vehicles: record fuel filled and card top-ups, and see which card needs a refill.
export default async function FuelPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  if (!can(user, 'fuel_use')) redirect('/');
  const sp = await searchParams;
  const scope = await fuelScope(user);
  const list = await cards(scope);
  const mgr = seesBalance(user);
  const recent = await recentFuel(10, scope, !mgr);
  const lowOnes = mgr ? list.filter((c) => c.low) : [];
  const now = Date.now();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Fuel Entry</h1>
          <p className='muted'>{scope ? 'Your fuel card' + (list.length === 1 ? '' : 's') + '. ' : 'One fuel card each for the Office Genset, BOLDBus, BRV and United Bike. '}{mgr ? 'Record every fill and every top-up so the balance is always right.' : 'Record every fill with the amount.'}</p>
        </div>
      </div>
      <Flash sp={sp} />

      {lowOnes.length ? (
        <p className='badline'>Refill needed: {lowOnes.map((c) => c.name + ' (' + pkr(c.balance) + ' left)').join(', ')}</p>
      ) : null}

      <div className='fuelcards'>
        {list.map((c) => (
          <div key={c.id} className={'card fuelcard' + (mgr && c.low ? ' low' : '')}>
            <div className='fname'>{c.name}</div>
            {mgr ? <div className={'fbal' + (c.n === 0 ? ' none' : c.low ? ' bad' : ' ok')}>{c.n === 0 ? 'No entries yet' : <CountUp value={c.balance} />}</div> : null}
            {mgr ? <div className='fmeta'>Refill when below {pkr(c.low_at)}</div> : null}
            {!mgr ? null : c.n > 0 ? (
              <div className='fmeta'>
                {c.low ? <b className='fneed'>Needs a refill</b> : c.daysLeft !== null ? 'About ' + c.daysLeft + ' days of fuel left at the last 30 days pace' : 'Balance is healthy'}
              </div>
            ) : <div className='fmeta'>Add the opening balance below to start</div>}
            <div className='fmeta'>{c.fill_ms ? (mgr ? 'Last fuel ' + fmtDay(c.fill_ms) : null) : 'No fuel recorded yet'}{mgr && c.topup_ms ? ' | Last top-up ' + fmtDay(c.topup_ms) : ''}</div>
            {!mgr && c.fill_ms ? <div style={{ fontSize: 24, fontWeight: 700 }}>{pkr(c.fill_amount)}</div> : null}
            {!mgr && c.fill_ms ? <div className='fmeta'>Last fuel filled on {fmtDay(c.fill_at_ms)}, {fmt12(c.fill_at_ms)}</div> : null}
          </div>
        ))}
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>{mgr ? 'Record Fuel Or A Top-up' : 'Record Fuel'}</h3>
        <form action={addFuel} className='form'>
          <label>Card
            <select name='asset' required defaultValue=''>
              <option value='' disabled>Choose</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {mgr ? (
            <label>What happened
              <select name='kind' defaultValue='fill'>{FUEL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          ) : <input type='hidden' name='kind' value='fill' />}
          <label>Amount (PKR)<input type='number' name='amount' min='1' step='0.01' inputMode='decimal' required /></label>
          <label>Litres (fuel only)<input type='number' name='litres' min='0.1' step='0.01' inputMode='decimal' placeholder='Optional' /></label>
          <label>Meter reading (km or hours)<input type='number' name='reading' min='0' step='0.1' inputMode='decimal' placeholder='Optional' /></label>
          <label>Date<input type='date' name='date' defaultValue={todayKey()} required /></label>
          <label>Time<input type='time' name='time' defaultValue={fmtTime(now)} required /></label>
          <label className='wide'>Note (optional)<input name='note' maxLength={120} placeholder='For example: filled at the PSO pump' /></label>
          <button className='btn primary' type='submit'>Save</button>
        </form>
        {mgr ? <p className='muted' style={{ marginBottom: 0 }}>Use <b>Opening balance</b> once for each card to enter what is on it today. After that, record <b>Fuel filled</b> each time and <b>Card top-up</b> each time money is added.</p> : null}
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Latest Entries</h3>
        {recent.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>When</th><th>Card</th><th>What</th><th className='r'>Amount</th><th>Litres</th><th>By</th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className='nw c-meta'>{fmtDay(t.at_ms)}, {fmt12(t.at_ms)}</td>
                    <td className='c-title'><b>{t.asset}</b></td>
                    <td className='c-meta'>{FKIND[t.kind]}{t.note ? <div className='muted'>{t.note}</div> : null}</td>
                    <td className='r nw c-meta'>{t.kind === 'fill' ? '- ' : '+ '}{pkr(t.amount)}</td>
                    <td className='c-meta'>{t.litres ? t.litres : '-'}</td>
                    <td className='c-meta'>{t.by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>Nothing recorded yet.</p>}
        <p className='totals'><Link href='/fuel/log'>See the full fuel log</Link></p>
      </div>
    </>
  );
}