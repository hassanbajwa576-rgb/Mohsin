import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ATT_ROLES, dateKey, fmtTime } from '@/lib/att';
import { can } from '@/lib/perms';
import { allOffices } from '@/lib/att';
import { VTYPES, V_COLS, V_FROM, canEditVisitor } from '@/lib/visitors';
import { editVisitor } from '@/lib/vis-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function EditVisitorPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  const v = (await q(`SELECT ${V_COLS} ${V_FROM} WHERE v.id = $1`, [Number(sp.id) || 0]))[0];
  if (!v || !canEditVisitor(user, v)) redirect('/visitors');
  const back = can(user, 'vis_log') ? '/visitors/log' : '/visitors';
  return (
    <>
      <div className='head'><div><h1>Edit visitor record</h1></div></div>
      <Flash sp={sp} />
      <form action={editVisitor} className='card form'>
        <input type='hidden' name='id' value={v.id} />
        <label>Name<input name='name' defaultValue={v.name} required maxLength={80} /></label>
        <label>Phone<input name='phone' defaultValue={v.phone} maxLength={30} /></label>
        <label>Type of visit<select name='vtype' defaultValue={v.vtype}>{VTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Company / bank<input name='company' defaultValue={v.company} maxLength={80} /></label>
        <label>Meeting with<input name='host' defaultValue={v.host} maxLength={80} /></label>
        <label>Badge / card no.<input name='badge' defaultValue={v.badge} maxLength={20} /></label>
        {allOffices(user) ? <label>Office<select name='office' defaultValue={v.office}><option>LHR</option><option>ISB</option></select></label> : null}
        <label>Date in<input type='date' name='in_date' defaultValue={dateKey(v.in_ms)} required /></label>
        <label>Time in<input type='time' name='in_time' defaultValue={fmtTime(v.in_ms)} required /></label>
        <label>Date out<input type='date' name='out_date' defaultValue={v.out_ms ? dateKey(v.out_ms) : ''} /></label>
        <label>Time out<input type='time' name='out_time' defaultValue={v.out_ms ? fmtTime(v.out_ms) : ''} /></label>
        <label className='wide'>Purpose / notes<input name='purpose' defaultValue={v.purpose} maxLength={200} /></label>
        <p className='muted wide'>Leave the check out date and time empty if the visitor is still inside.</p>
        <button className='btn primary' type='submit'>Save</button>
        <Link href={back} className='btn ghost'>Cancel</Link>
      </form>
    </>
  );
}