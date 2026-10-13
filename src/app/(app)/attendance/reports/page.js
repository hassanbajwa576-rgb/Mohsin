import OfficeTag from '@/components/OfficeTag';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@/lib/perms';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, reportRows, departments, fmtDur, todayKey, validDate, BREAK_LIMIT_MIN } from '@/lib/att';

export const dynamic = 'force-dynamic';

export default async function AttendanceReportsPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_reports')) redirect('/attendance');
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  let from = validDate(sp.from || '') ? sp.from : today.slice(0, 8) + '01';
  if (from > to) from = to;
  const office = ['LHR', 'ISB'].includes(sp.office) ? sp.office : '';
  const depts = await departments();
  const dept = depts.includes(sp.dept) ? sp.dept : '';
  const rows = await reportRows({ from, to, office, dept });
  const qs = new URLSearchParams({ from, to, ...(office ? { office } : {}), ...(dept ? { dept } : {}) }).toString();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Attendance reports</h1>
          <p className='muted'>One row per shift. Worked time is check in to check out, minus breaks.</p>
        </div>
        <div className='inline'>
          <a href={'/attendance/reports/xlsx?' + qs} className='btn primary'>Download Excel (.xlsx)</a>
          <a href={'/attendance/reports/export?' + qs} className='btn ghost'>CSV</a>
        </div>
      </div>

      <form method='get' className='card filters'>
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        <label>Office
          <select name='office' defaultValue={office}><option value=''>Both</option><option>LHR</option><option>ISB</option></select>
        </label>
        <label>Department
          <select name='dept' defaultValue={dept}>
            <option value=''>All departments</option>
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/attendance/reports' className='btn ghost'>Reset</Link>
      </form>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>Date</th><th>Office</th><th>Department</th><th>Employee</th><th>In</th><th>Out</th><th>Breaks</th><th>Break time</th><th>Worked</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className='nw'>{r.date}</td>
                    <td><OfficeTag o={r.office} /></td>
                    <td>{r.dept || '-'}</td>
                    <td><b>{r.name}</b></td>
                    <td className='nw'>{r.in}</td>
                    <td className='nw'>{r.out}</td>
                    <td>{r.breaks}</td>
                    <td className={'nw' + (r.over ? ' over-t' : '')}>{fmtDur(r.breakMs)}</td>
                    <td className='nw'>{fmtDur(r.workedMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='muted'>No attendance in this range.</p>
        )}
        <p className='totals'>{rows.length} shifts. Red break time means more than {BREAK_LIMIT_MIN} minutes of breaks in the shift.</p>
      </div>
    </>
  );
}
