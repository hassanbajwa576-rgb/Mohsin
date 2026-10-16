import OfficeTag from '@/components/OfficeTag';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@/lib/perms';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, reportRows, departments, fmtDur, todayKey, validDate, lastWorkDay, breakFilter, BREAK_LIMIT_MIN, inClass, outClass, to12 } from '@/lib/att';

export const dynamic = 'force-dynamic';

export default async function AttendanceReportsPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_reports')) redirect('/attendance');
  const sp = await searchParams;
  const today = todayKey();
  // Opens on the latest working day before today (yesterday on a normal weekday).
  const day = validDate(sp.from || '') || validDate(sp.to || '') ? '' : await lastWorkDay(today);
  const to = validDate(sp.to || '') ? sp.to : day || today;
  let from = validDate(sp.from || '') ? sp.from : day || today.slice(0, 8) + '01';
  if (from > to) from = to;
  const brk = ['normal', 'extended'].includes(sp.brk) ? sp.brk : '';
  // Only the Sr. OM and Sr. SO see both offices; everyone else sees their own office only.
  const office = allOffices(user) ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const depts = await departments();
  const dept = depts.includes(sp.dept) ? sp.dept : '';
  const rows = breakFilter(await reportRows({ from, to, office, dept }), brk);
  const qs = new URLSearchParams({ from, to, ...(office ? { office } : {}), ...(dept ? { dept } : {}), ...(brk ? { brk } : {}) }).toString();

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
          <select name='office' defaultValue={office}>{(allOffices(user) ? ['', 'LHR', 'ISB'] : [user.office_code]).map((o) => <option key={o} value={o}>{o || 'Both'}</option>)}</select>
        </label>
        <label>Department
          <select name='dept' defaultValue={dept}>
            <option value=''>All departments</option>
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>Breaks
          <select name='brk' defaultValue={brk}>
            <option value=''>All breaks</option>
            <option value='normal'>Normal (up to {BREAK_LIMIT_MIN / 60} hour)</option>
            <option value='extended'>Extended (over {BREAK_LIMIT_MIN / 60} hour)</option>
          </select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/attendance/reports' className='btn ghost'>Reset</Link>
      </form>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='shift'>
              <thead>
                <tr><th>Date</th><th>Office</th><th>Department</th><th>Employee</th><th>In</th><th>Out</th><th>Breaks</th><th>Break time</th><th>Worked</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className='nw c-meta'>{r.date}</td>
                    <td className='c-meta'><OfficeTag o={r.office} /></td>
                    <td className='c-meta'>{r.dept || '-'}</td>
                    <td className='c-name'><b>{r.name}</b></td>
                    <td className={'nw c-tile ' + inClass(r.in)}>{to12(r.in)}</td>
                    <td className={'nw c-tile ' + (/^[0-9]/.test(r.out) ? outClass(r.out) : '')}>{/^[0-9]/.test(r.out) ? to12(r.out) : r.out}</td>
                    <td className='c-tile'>{r.breaks}</td>
                    <td className={'nw c-tile ' + (r.breakMs === 0 ? '' : r.over ? 't-bad' : 't-ok')}>{fmtDur(r.breakMs)}</td>
                    <td className={'nw c-tile g ' + (/^[0-9]/.test(r.out) ? (r.workedMs >= 28800000 ? 't-ok' : 't-bad') : '')}>{fmtDur(r.workedMs)}</td>
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
