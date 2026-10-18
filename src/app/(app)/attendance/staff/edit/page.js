import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, departments, shiftText } from '@/lib/att';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { updateStaff } from '@/lib/att-actions';
import ShiftFields from '@/components/ShiftFields';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_staff')) redirect('/attendance');
  const sp = await searchParams;
  const id = Number(sp.id);
  const r = (
    await q(
      'SELECT s.id, s.code, s.name, s.dept, s.shift, s.shift_start, s.shift_end, s.office_id, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.id = $1',
      [Number.isInteger(id) ? id : 0]
    )
  )[0];
  if (!r || (!allOffices(user) && r.office_id !== user.office_id)) redirect('/attendance/staff');
  const depts = await departments();
  const ds = (await q('SELECT dept, shift, shift_start, shift_end FROM pc2_dept_shifts WHERE dept = $1', [r.dept]))[0];

  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit employee</h1>
          <p className='muted'>{r.name} #{r.code}</p>
        </div>
        <Link href='/attendance/staff' className='btn ghost'>Back to Employees</Link>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <form action={updateStaff} className='form'>
          <input type='hidden' name='id' value={r.id} />
          <label>Name<input name='name' defaultValue={r.name} required /></label>
          <label>Department<input name='dept' defaultValue={r.dept} list='dept-list' /></label>
          <datalist id='dept-list'>{depts.map((d) => <option key={d} value={d} />)}</datalist>
          <label>Office
            <select name='office' defaultValue={r.office}><option>LHR</option><option>ISB</option></select>
          </label>
          {ds ? <p className='muted wide'>The {r.dept} department shift is {shiftText(ds)}. Leave this employee on <b>Same as department</b> to follow it, or pick a shift below to give just this person their own.</p> : null}
          <ShiftFields shift={r.shift} start={r.shift_start} end={r.shift_end} noneLabel={ds ? 'Same as department' : 'None'} />
          <button className='btn primary' type='submit'>Save</button>
        </form>
      </div>
    </>
  );
}
