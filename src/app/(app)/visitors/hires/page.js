import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { ATT_ROLES, allOffices, departments, todayKey } from '@/lib/att';
import { saveHire, deleteHire } from '@/lib/hire-actions';
import ConfirmButton from '@/components/ConfirmButton';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// New hires: who is joining, in which department, on what date, at which office and at what level.
export default async function NewHiresPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'hire_info')) redirect('/visitors');
  const sp = await searchParams;
  const today = todayKey();
  const depts = await departments();
  const rows = await q(
    `SELECT h.id, h.name, h.dept, h.level, to_char(h.join_date, 'YYYY-MM-DD') AS join_date, o.code AS office
     FROM pc2_hires h JOIN pc2_offices o ON o.id = h.office_id ${allOffices(user) ? '' : 'WHERE h.office_id = ' + Number(user.office_id)}
     ORDER BY h.join_date DESC, h.id DESC LIMIT 300`
  );
  const edit = rows.find((r) => String(r.id) === String(sp.edit || '')) || null;
  const upcoming = rows.filter((r) => r.join_date >= today).length;

  return (
    <>
      <div className='head'>
        <div>
          <h1>New Hires</h1>
          <p className='muted'>Details of people who are joining: name, department, joining date, office and level.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>{edit ? 'Edit new hire' : 'Add a new hire'}</h3>
        <form action={saveHire} className='form' key={edit ? edit.id : 'new'}>
          {edit ? <input type='hidden' name='id' value={edit.id} /> : null}
          <label>Name<input name='name' defaultValue={edit ? edit.name : ''} required maxLength={80} autoComplete='off' /></label>
          <label>Department<input name='dept' defaultValue={edit ? edit.dept : ''} list='hire-depts' maxLength={60} autoComplete='off' /></label>
          <datalist id='hire-depts'>{depts.map((d) => <option key={d} value={d} />)}</datalist>
          <label>Joining date<input type='date' name='join_date' defaultValue={edit ? edit.join_date : today} required /></label>
          <label>Office location
            <select name='office' defaultValue={edit ? edit.office : allOffices(user) ? 'LHR' : user.office_code}>
              {allOffices(user) ? <><option value='LHR'>LHR</option><option value='ISB'>ISB</option><option value='REMOTE'>Remote</option></> : <option value={user.office_code}>{user.office_code}</option>}
            </select>
          </label>
          <label>Level #<input name='level' defaultValue={edit ? edit.level : ''} maxLength={20} placeholder='For example: 3' autoComplete='off' /></label>
          <button className='btn primary' type='submit'>{edit ? 'Save changes' : 'Add new hire'}</button>
          {edit ? <Link href='/visitors/hires' className='btn ghost'>Cancel</Link> : null}
        </form>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>New hires{upcoming ? <span className='v-count'>{upcoming}</span> : null}</h3>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Name</th><th>Department</th><th>Joining date</th><th>Office</th><th>Level</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className='c-title'><b>{r.name}</b>{r.join_date >= today ? <span className='srctag'>{r.join_date === today ? 'joins today' : 'upcoming'}</span> : null}</td>
                    <td className='c-meta'>{r.dept || '-'}</td>
                    <td className='nw c-meta'>{r.join_date}</td>
                    <td className='c-meta'><OfficeTag o={r.office} /></td>
                    <td className='c-meta'>{r.level ? 'Level ' + r.level : '-'}</td>
                    <td className='act'>
                      <Link className='btn' href={'/visitors/hires?edit=' + r.id}>Edit</Link>
                      <form action={deleteHire} className='inline'>
                        <input type='hidden' name='id' value={r.id} />
                        <ConfirmButton className='btn ghost' message={'Remove ' + r.name + ' from the new hires list?'}>Remove</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No new hires recorded yet.</p>}
      </div>
    </>
  );
}
