import OfficeTag from '@/components/OfficeTag';
import ReportFilters from '@/components/ReportFilters';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@/lib/perms';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, reportRows, departments, fmtDur, todayKey, validDate, lastWorkDay, breakFilter, BREAK_LIMIT_MIN, inClassFor, outClassFor, to12 } from '@/lib/att';

export const dynamic = 'force-dynamic';

export default async function AttendanceReportsPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_reports')) redirect('/attendance');
  const sp = await searchParams;
  const today = todayKey();
  // Opens on the latest working day before today (yesterday on a normal weekday).
  const lastDay = await lastWorkDay(today);
  const day = validDate(sp.from || '') || validDate(sp.to || '') ? '' : lastDay;
  const to = validDate(sp.to || '') ? sp.to : day || today;
  let from = validDate(sp.from || '') ? sp.from : day || today.slice(0, 8) + '01';
  if (from > to) from = to;
  const brk = ['normal', 'extended'].includes(sp.brk) ? sp.brk : '';
  // Only the Sr. OM and Sr. SO see both offices; everyone else sees their own office only.
  const office = allOffices(user) ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const depts = await departments();
  // One or more departments (none ticked means all of them).
  const dsel = [].concat(sp.dept || []).filter((d) => depts.includes(d));
  const rows = breakFilter(await reportRows({ from, to, office, dept: dsel }), brk);
  const qp = new URLSearchParams({ from, to, ...(office ? { office } : {}), ...(brk ? { brk } : {}) });
  dsel.forEach((d) => qp.append('dept', d));
  const qs = qp.toString();

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

      <ReportFilters today={today} lastDay={lastDay} from={from} to={to} office={office} canOffice={allOffices(user)} depts={depts} selected={dsel} resetHref='/attendance/reports' quick={['day', '7', '30', 'month', 'last']}>
        <label className='fbar-field'>Breaks
          <select name='brk' defaultValue={brk}>
            <option value=''>All breaks</option>
            <option value='normal'>Normal (up to {BREAK_LIMIT_MIN / 60} hour)</option>
            <option value='extended'>Extended (over {BREAK_LIMIT_MIN / 60} hour)</option>
          </select>
        </label>
      </ReportFilters>

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
                    <td className={'nw c-tile ' + inClassFor(r.in, r)}><span className={r.inX ? 'xl' : ''} title={r.inX ? 'Imported from Excel' : undefined}>{to12(r.in)}</span></td>
                    <td className={'nw c-tile ' + (/^[0-9]/.test(r.out) ? outClassFor(r.out, r) : '')}><span className={r.outX ? 'xl' : ''} title={r.outX ? 'Imported from Excel' : undefined}>{/^[0-9]/.test(r.out) ? to12(r.out) : r.out}</span></td>
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
