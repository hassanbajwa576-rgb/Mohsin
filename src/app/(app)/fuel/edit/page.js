import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { dateKey, fmtTime } from '@/lib/att';
import { cards, fuelScope, canEditFuel, seesBalance, TXN_COLS, TXN_FROM, FUEL_KINDS } from '@/lib/fuel';
import { editFuel } from '@/lib/fuel-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Correct a fuel entry: the card, what happened, the amount, litres, meter reading, date, time or note.
export default async function FuelEditPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  if (!can(user, 'fuel_use')) redirect('/');
  const sp = await searchParams;
  const id = Number(sp.id);
  const t = (await q(`SELECT ${TXN_COLS}, t.created_by ${TXN_FROM} WHERE t.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!t) redirect('/fuel/log?err=' + encodeURIComponent('That entry no longer exists'));
  if (!canEditFuel(user, t)) redirect('/fuel/log?err=' + encodeURIComponent('You can change only the entries you recorded yourself'));
  const scope = await fuelScope(user);
  const list = await cards(scope);
  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit Fuel Entry</h1>
          <p className='muted'>Recorded by {t.by_name || 'someone'}. {seesBalance(user) ? 'The card balance updates with your change.' : ''}</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <form action={editFuel} className='form'>
          <input type='hidden' name='id' value={t.id} />
          <label>Card
            <select name='asset' required defaultValue={t.asset_id}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {seesBalance(user) ? (
            <label>What happened
              <select name='kind' defaultValue={t.kind}>{FUEL_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          ) : <input type='hidden' name='kind' value='fill' />}
          <label>Amount (PKR)<input type='number' name='amount' min='0.01' step='0.01' inputMode='decimal' defaultValue={t.amount} required /></label>
          <label>Litres (fuel only)<input type='number' name='litres' min='0.1' step='0.01' inputMode='decimal' defaultValue={t.litres ?? ''} placeholder='Optional' /></label>
          <label>Meter reading (km or hours)<input type='number' name='reading' min='0' step='0.1' inputMode='decimal' defaultValue={t.reading ?? ''} placeholder='Optional' /></label>
          <label>Date<input type='date' name='date' defaultValue={dateKey(t.at_ms)} required /></label>
          <label>Time<input type='time' name='time' defaultValue={fmtTime(t.at_ms)} required /></label>
          <label className='wide'>Note (optional)<input name='note' maxLength={120} defaultValue={t.note || ''} /></label>
          <button className='btn primary' type='submit'>Save changes</button>
          <Link href='/fuel/log' className='btn ghost'>Cancel</Link>
        </form>
      </div>
    </>
  );
}
