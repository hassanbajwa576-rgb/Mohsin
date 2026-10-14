import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices } from '@/lib/att';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { addStaff, updateStaff, toggleStaff, importStaff } from '@/lib/att-actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function AttendanceStaffPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_staff')) redirect('/attendance');
  const sp = await searchParams;
  const rows = await q(
    `SELECT s.id, s.code, s.name, s.dept, s.active, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id ${allOffices(user) ? '' : 'WHERE s.office_id = ' + Number(user.office_id)} ORDER BY s.active DESC, o.code, s.name`
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
          <label>Employee code (optional)<input name='code' /></label>
          <label>Department<input name='dept' /></label>
          <label>Office
            <select name='office' defaultValue='LHR'><option>LHR</option><option>ISB</option></select>
          </label>
          <button className='btn primary' type='submit'>Add employee</button>
        </form>
      </details>

      <details className='card'>
        <summary>Upload employees from Excel</summary>
        <p className='muted'>One row per employee with the columns <b>Name</b>, <b>Department</b>, <b>Office</b> (LHR or ISB) and an optional <b>Code</b>. People already in the list are skipped.</p>
        <form action={importStaff} className='form'>
          <label className='wide'>Excel file (.xlsx)<input type='file' name='file' accept='.xlsx' required /></label>
          <label>Office for rows without one
            <select name='office' defaultValue='LHR'><option>LHR</option><option>ISB</option></select>
          </label>
          <button className='btn primary' type='submit'>Upload employees</button>
          <a className='btn ghost' href='/attendance/staff/template'>Download template</a>
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
                          <label>Code<input name='code' defaultValue={r.code} /></label>
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
