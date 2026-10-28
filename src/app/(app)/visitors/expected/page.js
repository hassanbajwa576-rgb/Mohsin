import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ATT_ROLES, allOffices, dateKey, fmtTime } from '@/lib/att';
import { VTYPES, E_COLS, hostNames } from '@/lib/visitors';
import HostPicker from '@/components/HostPicker';
import TimePick from '@/components/TimePick';
import { editExpected } from '@/lib/vis-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Change an expected visitor before they arrive (name, who they meet, day and time, office).
export default async function EditExpectedPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  if (user.role === 'guard') redirect('/visitors');
  const v = (await q(`SELECT ${E_COLS} FROM pc2_expected e JOIN pc2_offices o ON o.id = e.office_id WHERE e.id = $1 AND e.status = 'waiting'`, [Number(sp.id) || 0]))[0];
  if (!v || (!allOffices(user) && user.office_id !== v.office_id)) redirect('/visitors');
  return (
    <>
      <div className='head'><div><h1>Edit expected visitor</h1></div></div>
      <Flash sp={sp} />
      <form action={editExpected} className='card form'>
        <input type='hidden' name='id' value={v.id} />
        <label>Name<input name='name' defaultValue={v.name} required maxLength={80} /></label>
        <label>Phone<input name='phone' defaultValue={v.phone} maxLength={30} /></label>
        <label>Type of visit<select name='vtype' defaultValue={v.vtype}>{VTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Company / bank<input name='company' defaultValue={v.company} maxLength={80} /></label>
        <div className='wide'><span className='att-lbl'>Meeting with (one or more people)</span><HostPicker defaultValue={v.host} names={await hostNames(allOffices(user) ? '' : user.office_code)} listId='vis-hosts-exp' /></div>
        {allOffices(user) ? <label>Office<select name='office' defaultValue={v.office}><option>LHR</option><option>ISB</option></select></label> : null}
        <label>Expected date<input type='date' name='date' defaultValue={dateKey(v.due_ms)} required /></label>
        <label>Expected time<TimePick role={user.role} name='time' defaultValue={fmtTime(v.due_ms)} required /></label>
        <label className='wide'>Purpose / notes<input name='purpose' defaultValue={v.purpose} maxLength={200} /></label>
        <button className='btn primary' type='submit'>Save</button>
        <Link href='/visitors' className='btn ghost'>Cancel</Link>
      </form>
    </>
  );
}
