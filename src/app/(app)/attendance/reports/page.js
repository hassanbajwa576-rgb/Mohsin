import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { reportRows, fmtDur, todayKey, validDate, BREAK_LIMIT_MIN } from '@/lib/att';

export const dynamic = 'force-dynamic';

export default async function AttendanceReportsPage({ searchParams }) {
  await requireUser(['om', 'sso']);
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  let from = validDate(sp.from || '') ? sp.from : today.slice(0, 8) + '01';
  if (from > to) from = to;
  const office = ['LHR', 'ISB'].includes(sp.office) ? sp.office : '';
  const rows = await reportRows({ from, to, office });
  const qs = new URLSearchParams({ from, to, ...(office ? { office } : {}) }).toString();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Attendance reports</h1>
          <p className='muted'>One row per shift. Worked time is check in to check out, minus breaks.</p>
        </div>
        <a href={'/attendance/reports/export?' + qs} className='btn primary'>Download (Excel / CSV)</a>
      </div>

      <form method='get' className='card filters'>
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        <label>Office
          <select name='office' defaultValue={office}><option value=''>Both</option><option>LHR</option><option>ISB</option></select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/attendance/reports' className='btn ghost'>Reset</Link>
      </form>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>Date</th><th>Office</th><th>Employee</th><th>Code</th><th>In</th><th>Out</th><th>Breaks</th><th>Break time</th><th>Worked</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className='nw'>{r.date}</td>
                    <td><span className='pill'>{r.office}</span></td>
                    <td><b>{r.name}</b></td>
                    <td>{r.code}</td>
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
