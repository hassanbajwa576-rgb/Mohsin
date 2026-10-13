import OfficeTag from '@/components/OfficeTag';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@/lib/perms';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { removeEntry } from '@/lib/att-actions';
import { ATT_ROLES, KIND_LABEL, fmtTime, dateKey, todayKey, validDate, conflictIds, eventsAround, timeClass } from '@/lib/att';
import EntryEdit from '@/components/EntryEdit';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function AttendanceLogsPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_logs')) redirect('/attendance');
  const sp = await searchParams;
  const day = validDate(sp.date || '') ? sp.date : todayKey();
  const office = ['LHR', 'ISB'].includes(sp.office) ? sp.office : '';

  const rows = await q(
    `SELECT a.id, a.staff_id, a.kind, a.entered_by, s.name, s.code, o.code AS office, u.name AS by_name,
            (extract(epoch from a.at) * 1000)::float8 AS ms, (extract(epoch from a.entered_at) * 1000)::float8 AS entered_ms,
            (a.entered_at > now() - interval '30 minutes') AS fresh
     FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id JOIN pc2_offices o ON o.id = a.office_id LEFT JOIN pc2_users u ON u.id = a.entered_by
     WHERE a.at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Karachi' AND a.at < ($1::date + 1)::timestamp AT TIME ZONE 'Asia/Karachi'
     ${office ? 'AND o.code = $2' : ''}
     ORDER BY a.at DESC, a.id DESC`,
    office ? [day, office] : [day]
  );
  const bad = conflictIds(await eventsAround([...new Set(rows.map((r) => r.staff_id))], day));

  return (
    <>
      <div className='head'>
        <div>
          <h1>Attendance logs</h1>
          <p className='muted'>Every check in, check out and break entry for the chosen day (Pakistan time).</p>
        </div>
      </div>
      <Flash sp={sp} />

      <form method='get' className='card filters'>
        <label>Date<input type='date' name='date' defaultValue={day} /></label>
        <label>Office
          <select name='office' defaultValue={office}><option value=''>Both</option><option>LHR</option><option>ISB</option></select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/attendance/logs' className='btn ghost'>Today</Link>
      </form>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>Time</th><th>Office</th><th>Employee</th><th>Entry</th><th>Added by</th><th>Entered at</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={bad.has(r.id) ? 'conflict' : ''}>
                    <td className={'nw ' + timeClass(r.kind, fmtTime(r.ms))}><b>{fmtTime(r.ms)}</b></td>
                    <td><OfficeTag o={r.office} /></td>
                    <td>{r.name}</td>
                    <td>{KIND_LABEL[r.kind]}{bad.has(r.id) ? <div className='over-t'>Does not fit - please fix</div> : null}</td>
                    <td>{r.by_name || '-'}</td>
                    <td className='nw muted'>{(dateKey(r.entered_ms) === day ? '' : dateKey(r.entered_ms) + ' ') + fmtTime(r.entered_ms)}</td>
                    <td className='act'>
                      {user.role === 'om' ? <EntryEdit m={r} back='/attendance/logs' /> : null}
                      {user.role === 'om' ? (
                        <form action={removeEntry} className='inline'>
                          <input type='hidden' name='id' value={r.id} />
                          <input type='hidden' name='back' value='/attendance/logs' />
                          <button className='btn ghost' type='submit'>Delete</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className='muted'>No entries on this day.</p>
        )}
        <p className='totals'>{rows.length} entries. Only the Sr. Ops Manager can delete entries from here.</p>
      </div>
    </>
  );
}
