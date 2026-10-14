import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices } from '@/lib/att';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { addStaff, updateStaff, toggleStaff, importStaff, deleteStaff } from '@/lib/att-actions';
import ConfirmButton from '@/components/ConfirmButton';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function AttendanceStaffPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_staff')) redirect('/attendance');
  const sp = await searchParams;
  const rows = await q(
    `SELECT s.id, s.code, s.name, s.dept, s.active, o.code AS office, (SELECT COUNT(*)::int FROM pc2_attendance a WHERE a.staff_id = s.id) AS entries FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id ${allOffices(user) ? '' : 'WHERE s.office_id = ' + Number(user.office_id)} ORDER BY s.active DESC, o.code, s.name`
  );

  const fo = allOffices(user) && ['LHR', 'ISB'].includes(sp.office) ? sp.office : '';
  const fs = ['active', 'inactive'].includes(sp.status) ? sp.status : '';
  const inOffice = rows.filter((r) => !fo || r.office === fo);
  const shown = inOffice.filter((r) => !fs || (fs === 'active') === r.active);
  const nActive = inOffice.filter((r) => r.active).length;
  const href = (o, s) => {
    const p = new URLSearchParams();
    if (o) p.set('office', o);
    if (s) p.set('status', s);
    const q2 = p.toString();
    return '/attendance/staff' + (q2 ? '?' + q2 : '');
  };

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

      <div className='chips' style={{ marginBottom: 8 }}>
        <Link href={href(fo, '')} className={'chip' + (!fs ? ' on' : '')}>Total ({inOffice.length})</Link>
        <Link href={href(fo, 'active')} className={'chip' + (fs === 'active' ? ' on' : '')}>Active ({nActive})</Link>
        <Link href={href(fo, 'inactive')} className={'chip' + (fs === 'inactive' ? ' on' : '')}>Inactive ({inOffice.length - nActive})</Link>
      </div>
      {allOffices(user) ? (
        <div className='chips' style={{ marginBottom: 12 }}>
          {['', 'LHR', 'ISB'].map((o) => (
            <Link key={o || 'all'} href={href(o, fs)} className={'chip' + (fo === o ? ' on' : '')}>{o || 'Both offices'}</Link>
          ))}
        </div>
      ) : null}

      <div className='card'>
        {shown.length ? (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>Sr #</th><th>Name</th><th>Department</th><th>Office</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td><b>{r.name}</b></td>
                    <td>{r.dept || '-'}</td>
                    <td><span className='pill'>{r.office}</span></td>
                    <td><span className={'badge ' + (r.active ? 'approved' : 'rejected')}>{r.active ? 'Active' : 'Inactive'}</span></td>
                    <td className='act'>
                      <details>
                        <summary className='btn'>Edit</summary>
                        <form action={updateStaff} className='form'>
                          <input type='hidden' name='id' value={r.id} />
                          <label>Name<input name='name' defaultValue={r.name} required /></label>
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
                      {user.role === 'om' ? (
                        <form action={deleteStaff} className='inline'>
                          <input type='hidden' name='id' value={r.id} />
                          <ConfirmButton className='btn ghost' message={'Delete ' + r.name + ' and all ' + r.entries + ' of their attendance entries? This cannot be undone.'}>Delete</ConfirmButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='muted'>{rows.length === 0 ? 'No employees yet. Add the first one above.' : 'No employees match this filter.'}</p>
        )}
      </div>
    </>
  );
}
