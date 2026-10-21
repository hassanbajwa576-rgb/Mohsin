import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TYPES, hkPeople } from '@/lib/roster';
import { requestTimeOff } from '@/lib/roster-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Anyone can ask for time off for a support team member; the Sr. Ops Manager or the Sr. Support Officer approves it.
export default async function RequestPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  const today = todayKey();
  const team = await hkPeople({ office: allOffices(user) ? '' : user.office_code });
  return (
    <>
      <div className='head'>
        <div>
          <h1>Time off request</h1>
          <p className='muted'>Ask for time off for a support team member. The Sr. Ops Manager or the Sr. Support Officer will approve or decline it, and you will be told.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <form action={requestTimeOff} className='card form'>
        <label>Team member
          <select name='name' required defaultValue=''>
            <option value='' disabled>Choose</option>
            {team.map((p) => <option key={p.id} value={p.name}>{p.name} ({p.office})</option>)}
          </select>
        </label>
        <label>Type<select name='kind' defaultValue='pto'>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>First day<input type='date' name='from' defaultValue={today} required /></label>
        <label>Last day<input type='date' name='to' defaultValue={today} required /></label>
        <label className='span3'>Note (optional)<input name='note' maxLength={120} placeholder='Reason' /></label>
        <label>Hours (only for part of a day)<input type='number' name='hours' min='0.25' max='24' step='0.25' placeholder='Leave empty for full days' /></label>
        <button className='btn primary' type='submit'>Send request</button>
      </form>
    </>
  );
}