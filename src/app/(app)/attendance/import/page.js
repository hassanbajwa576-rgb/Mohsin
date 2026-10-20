import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import ImportExcel from '@/components/ImportExcel';
import Flash from '@/components/Flash';
import { q } from '@/lib/db';
import { resolveReview, dismissNotes } from '@/lib/att-actions';

export const dynamic = 'force-dynamic';

// Last week (Monday to Sunday) is the usual thing to fill in.
function lastWeek(today) {
  const d = new Date(today + 'T00:00:00Z');
  const mon = addDay(today, -(((d.getUTCDay() + 6) % 7) + 7));
  return [mon, addDay(mon, 6)];
}

export default async function ImportPage({ searchParams }) {
  const user = await requireUser(['om']);
  if (user.role !== 'om') redirect('/attendance');
  const sp = await searchParams;
  const [from, to] = lastWeek(todayKey());
  const open = await q('SELECT id, kind, name, day, app_text, excel_text, reason, to_char(created_at AT TIME ZONE \'Asia/Karachi\', \'YYYY-MM-DD\') AS added FROM pc2_import_review WHERE resolved_at IS NULL ORDER BY day, name, id');
  const conflicts = open.filter((r) => r.kind === 'conflict');
  const notes = open.filter((r) => r.kind !== 'conflict');
  return (
    <>
      <div className='head'>
        <div>
          <h1>Import from Excel</h1>
          <p className='muted'>Fill in missing days from the weekly attendance sheet and the guard's break timing sheet. You review everything before anything is saved.</p>
        </div>
      </div>
      <Flash sp={sp} />
      {conflicts.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Needs review ({conflicts.length})</h3>
          <p className='muted'>Days where the Excel times differ from the app. The app times are still in place until you decide.</p>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Employee</th><th>Date</th><th>In the app</th><th>In the Excel file</th><th>What differs</th><th></th></tr></thead>
              <tbody>
                {conflicts.map((r) => (
                  <tr key={r.id}>
                    <td className='c-title'><b>{r.name}</b></td>
                    <td className='nw c-meta'>{r.day}</td>
                    <td className='c-meta'>{r.app_text}</td>
                    <td className='c-meta'><span className='xl'>{r.excel_text}</span></td>
                    <td className='c-meta'>{r.reason}</td>
                    <td className='act'>
                      <form action={resolveReview} className='inline'>
                        <input type='hidden' name='id' value={r.id} />
                        <button name='decision' value='excel' className='btn primary' type='submit'>Use Excel times</button>
                        <button name='decision' value='keep' className='btn' type='submit'>Keep app times</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {notes.length ? (
        <details className='card'>
          <summary>Not imported ({notes.length}): names not matched and skipped rows</summary>
          <p className='muted'>Add a missing employee on the Employees page, then read the file again. These stay here until you clear them, one by one or all at once.</p>
          <ul className='muted'>
            {notes.slice(0, 120).map((r) => (
              <li key={r.id}>
                {r.kind === 'unmatched' ? r.name + ' (' + r.reason + ', ' + r.day + ')' : r.reason}
                {' '}
                <form action={resolveReview} className='inline' style={{ display: 'inline' }}>
                  <input type='hidden' name='id' value={r.id} />
                  <button name='decision' value='dismiss' className='btn ghost' type='submit'>Clear</button>
                </form>
              </li>
            ))}
            {notes.length > 120 ? <li>...and {notes.length - 120} more</li> : null}
          </ul>
          <form action={dismissNotes}><button className='btn' type='submit'>Clear all</button></form>
        </details>
      ) : null}

      <ImportExcel from={from} to={to} />
    </>
  );
}
