import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { cards } from '@/lib/fuel';
import { saveFuelLevel, addFuelAsset } from '@/lib/fuel-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Sr. Ops Manager: the balance below which each card needs a top-up, and adding another card.
export default async function FuelSetupPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  if (!can(user, 'fuel_use')) redirect('/');
  if (user.role !== 'om') redirect('/fuel');
  const sp = await searchParams;
  const list = await cards();
  const people = await q("SELECT id, name, role FROM pc2_users WHERE active AND role IN ('so', 'guard', 'sso') ORDER BY name");
  const access = await q('SELECT asset_id, user_id FROM pc2_fuel_access');
  return (
    <>
      <div className='head'>
        <div>
          <h1>Fuel Setup</h1>
          <p className='muted'>The balance below which a card needs a top-up, and who can see each card. When a fill takes a card under its level, the Sr. Ops Manager and the Sr. Support Officer are notified.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        {list.map((c) => (
          <form key={c.id + '-' + c.low_at + '-' + c.name} action={saveFuelLevel} className='form' style={{ marginTop: 0, marginBottom: 14 }}>
            <input type='hidden' name='id' value={c.id} />
            <label>Card<input name='name' defaultValue={c.name} maxLength={60} required /></label>
            <label>Top up when below (PKR)<input type='number' name='low_at' min='0' step='1' defaultValue={c.low_at} required /></label>
            <div className='wide'>
              <span className='att-lbl'>Also visible to (Mohsin and Imran always see every card)</span>
              <div className='deptgrid'>
                {people.filter((p) => p.role !== 'sso').map((p) => (
                  <label key={p.id} className='checkrow'>
                    <input type='checkbox' name='who' value={p.id} defaultChecked={access.some((x) => x.asset_id === c.id && x.user_id === p.id)} /> {p.name}
                  </label>
                ))}
              </div>
            </div>
            <button className='btn' type='submit'>Save</button>
          </form>
        ))}
      </div>
      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Add Another Card</h3>
        <form action={addFuelAsset} className='form'>
          <label>Name<input name='name' maxLength={60} required placeholder='For example: Hilux' /></label>
          <label>Top up when below (PKR)<input type='number' name='low_at' min='0' step='1' placeholder='0' /></label>
          <button className='btn primary' type='submit'>Add card</button>
        </form>
      </div>
    </>
  );
}