import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { addStaff, updateStaff, toggleStaff } from '@/lib/att-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function AttendanceStaffPage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const rows = await q(
    `SELECT s.id, s.code, s.name, s.dept, s.active, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id ORDER BY s.active DESC, o.code, s.name`
  );

  return (
    <>
      <div className='head'>
        <div>
          <h1>Employees</h1>
          <p className='muted'>The people whose check in, check out and breaks are recorded. Guards and Support Officers are managed on the Team page.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <details className='card' open={rows.length === 0}>
        <summary>Add employee</summary>
        <form action={addStaff} className='form'>
          <label>Full name<input name='name' required /></label>
          <label>Employee code / badge no.<input name='code' required /></label>
          <label>Department<input name='dept' /></label>
          <label>Office
            <select name='office' defaultValue='LHR'><option>LHR</option><option>ISB</option></select>
          </label>
          <button className='btn primary' type='submit'>Add employee</button>
        </form>
      </details>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>Name</th><th>Code</th><th>Department</th><th>Office</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b></td>
                    <td>{r.code}</td>
                    <td>{r.dept || '-'}</td>
                    <td><span className='pill'>{r.office}</span></td>
                    <td><span className={'badge ' + (r.active ? 'approved' : 'rejected')}>{r.active ? 'Active' : 'Inactive'}</span></td>
                    <td className='act'>
                      <details>
                        <summary className='btn'>Edit</summary>
                        <form action={updateStaff} className='form'>
                          <input type='hidden' name='id' value={r.id} />
                          <label>Name<input name='name' defaultValue={r.name} required /></label>
                          <label>Code<input name='code' defaultValue={r.code} required /></label>
                          <label>Department<input name='dept' defaultValue={r.dept} /></label>
                          <label>Office
                            <select name='office' defaultValue={r.office}><option>LHR</option><option>ISB</option></select>
                          </label>
                          <button className='btn primary' type='submit'>Save</button>
                        </form>
                      </details>
                      <form action={toggleStaff} className='inline'>
                        <input type='hidden' name='id' value={r.id} />
                        <button className='btn ghost' type='submit'>{r.active ? 'Deactivate' : 'Activate'}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='muted'>No employees yet. Add the first one above.</p>
        )}
      </div>
    </>
  );
}
