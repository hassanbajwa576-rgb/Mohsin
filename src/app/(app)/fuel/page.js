import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { todayKey, fmtTime, fmt12, fmtDay } from '@/lib/att';
import { cards, recentFuel, fuelScope, seesBalance, FUEL_KINDS, FKIND } from '@/lib/fuel';
import { addFuel, requestRefill } from '@/lib/fuel-actions';
import { q } from '@/lib/db';
import Flash from '@/components/Flash';
import CountUp from '@/components/CountUp';

export const dynamic = 'force-dynamic';

const pkr = (n) => {
  const v = Number(n) || 0;
  const frac = Math.abs(v - Math.round(v)) > 0.004;
  return 'PKR ' + (frac ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));
};

// Fuel cards for the genset and the vehicles: record fuel filled and card top-ups, and see which card needs a top-up.
export default async function FuelPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  if (!can(user, 'fuel_use')) redirect('/');
  const sp = await searchParams;
  const scope = await fuelScope(user);
  const list = await cards(scope);
  const mgr = seesBalance(user);
  const recent = await recentFuel(10, scope, !mgr);
  const asks = await q("SELECT r.asset_id, (extract(epoch from r.requested_at) * 1000)::float8 AS at_ms, u.name FROM pc2_fuel_refill r LEFT JOIN pc2_users u ON u.id = r.requested_by WHERE r.status = 'open'");
  const lowOnes = mgr ? list.filter((c) => c.low) : [];
  const now = Date.now();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Fuel Entry</h1>
          <p className='muted'>{scope ? 'Your fuel card' + (list.length === 1 ? '' : 's') + '. ' : 'One fuel card each for the Office Genset, BOLDBus, BRV and United Bike. '}{mgr ? 'Record every fill and every top-up so the balance is always right.' : 'Record each time fuel is refilled in the vehicle.'}</p>
        </div>
      </div>
      <Flash sp={sp} />

      {lowOnes.length ? (
        <p className='badline'>Top-up needed: {lowOnes.map((c) => c.name + ' (' + pkr(c.balance) + ' left)').join(', ')}</p>
      ) : null}

      <div className='fuelcards'>
        {list.map((c) => (
          <div key={c.id} id={'card-' + c.id} className={'card fuelcard' + (c.low ? ' low' : '')}>
            <div className='fname'>{mgr || /fuel/i.test(c.name) ? c.name : c.name + ' fuel card'}</div>
            {mgr && c.n > 0 ? <div className='fmeta'>Balance on the card</div> : null}
            {mgr ? <div className={'fbal' + (c.n === 0 ? ' none' : c.low ? ' bad' : ' ok')}>{c.n === 0 ? 'No entries yet' : <CountUp value={c.balance} />}</div> : null}
            {mgr ? <div className='fmeta'>Top up when below {pkr(c.low_at)}</div> : null}
            {!mgr && c.n > 0 ? <div className='fmeta'>Fuel card status</div> : null}
            {!mgr && c.n > 0 ? <div className={'fbal ' + (c.low ? 'bad' : 'ok')} style={{ fontSize: 15 }}>{c.low ? 'Fuel card: Low' : 'Fuel card: OK'}</div> : null}
            {!mgr && c.n > 0 ? <div className='fmeta'>{c.low ? 'Please request a card top-up.' : 'Enough balance for now.'}</div> : null}
            {!mgr ? null : c.n > 0 ? (
              <div className='fmeta'>
                {c.low ? <b className='fneed'>Needs a top-up</b> : 'Balance is healthy'}
              </div>
            ) : <div className='fmeta'>Add the opening balance below to start</div>}
            <div className='fmeta'>{c.fill_ms ? (mgr ? 'Last fuel ' + fmtDay(c.fill_ms) : null) : 'No fuel recorded yet'}{mgr && c.topup_ms ? ' | Last top-up ' + fmtDay(c.topup_ms) : ''}</div>
            {!mgr && c.fill_ms ? <div style={{ fontSize: 24, fontWeight: 700 }}>{pkr(c.fill_amount)}</div> : null}
            {!mgr && c.fill_ms ? <div className='fmeta'>Last fuel filled on {fmtDay(c.fill_at_ms)}, {fmt12(c.fill_at_ms)}</div> : null}
            {user.role !== 'om' ? (() => {
              const ask = asks.find((x) => x.asset_id === c.id);
              return ask ? (
                <div className='fmeta'><b>Top-up requested</b> by {ask.name || 'someone'} on {fmtDay(ask.at_ms)}. Waiting for Mohsin.</div>
              ) : (
                <form action={requestRefill} className='inline'>
                  <input type='hidden' name='asset' value={c.id} />
                  <button className='btn' type='submit'>Request card top-up</button>
                </form>
              );
            })() : null}
          </div>
        ))}
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>{user.role === 'om' ? 'Record Fuel Or A Top-up' : 'Record Fuel Refilled'}</h3>
        {user.role !== 'om' ? <p className='muted' style={{ marginTop: 0 }}>Enter the fuel you put into the vehicle and the amount you paid for it.</p> : null}
        <form action={addFuel} className='form'>
          <label>{user.role === 'om' ? 'Card' : 'Fuel card'}
            <select name='asset' required defaultValue=''>
              <option value='' disabled>Choose</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {user.role === 'om' ? (
            <label>What happened
              <select name='kind' defaultValue='fill'>{FUEL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          ) : <input type='hidden' name='kind' value='fill' />}
          <label>{user.role === 'om' ? 'Amount (PKR)' : 'Amount paid for fuel (PKR)'}<input type='number' name='amount' min='1' step='0.01' inputMode='decimal' required /></label>
          <label>Date<input type='date' name='date' defaultValue={todayKey()} required /></label>
          <label className='wide'>Note (optional)<input name='note' maxLength={120} placeholder='For example: filled at the PSO pump' /></label>
          <button className='btn primary' type='submit'>{user.role === 'om' ? 'Save' : 'Save fuel refilled'}</button>
        </form>
        {user.role === 'om' ? <p className='muted' style={{ marginBottom: 0 }}>Use <b>Opening balance</b> once for each card to enter what is on it today. After that, record <b>Fuel filled</b> each time and <b>Card top-up</b> each time money is added.</p> : null}
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Latest Entries</h3>
        {recent.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>When</th><th>Card</th><th>What</th><th className='r'>Amount</th><th>By</th></tr></thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className='nw c-meta'>{fmtDay(t.at_ms)}, {fmt12(t.at_ms)}</td>
                    <td className='c-title'><b>{t.asset}</b></td>
                    <td className='c-meta'>{FKIND[t.kind]}{t.note ? <div className='muted'>{t.note}</div> : null}</td>
                    <td className='r nw c-meta'>{t.kind === 'fill' ? '- ' : '+ '}{pkr(t.amount)}</td>
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