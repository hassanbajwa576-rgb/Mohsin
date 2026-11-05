import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';
import { taskPeople } from '@/lib/tasks';
import { addReminder, toggleReminder, deleteReminder } from '@/lib/reminder-actions';
import { daysText } from '@/lib/weekdays';
import ReminderForm from '@/components/ReminderForm';
import ConfirmButton from '@/components/ConfirmButton';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const short = (n) => String(n || '').trim().split(/\s+/).slice(-1)[0];
const hourText = (h) => (h === 12 ? '12:00 PM' : h > 12 ? h - 12 + ':00 PM' : h + ':00 AM');
const when = (r) => (r.kind === 'once' ? 'Once, ' + r.on_date : r.kind === 'daily' ? 'Every day' : r.kind === 'days' ? 'Every ' + daysText(r.weekdays) : r.kind === 'm15' ? 'On the 15th of each month' : 'Last working day of each month') + ' at ' + hourText(r.hour);

export default async function RemindersPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so']);
  if (!can(user, 'tasks')) redirect('/');
  const sp = await searchParams;
  const people = await taskPeople(user);
  const ids = [user.id, ...people.map((p) => p.id)];
  const rows = await q(
    `SELECT r.id, r.user_id, r.created_by, r.title, r.note, r.kind, r.weekdays, r.hour, r.active, to_char(r.on_date, 'YYYY-MM-DD') AS on_date, ou.name AS owner_name, cu.name AS by_name
     FROM pc2_reminders r JOIN pc2_users ou ON ou.id = r.user_id LEFT JOIN pc2_users cu ON cu.id = r.created_by
     WHERE r.user_id = ANY($1::int[]) ORDER BY r.active DESC, r.id DESC LIMIT 200`,
    [ids]
  );
  const canRemove = (r) => r.created_by === user.id || user.role === 'om';
  return (
    <>
      <div className='head'>
        <div>
          <h1>Reminders</h1>
          <p className='muted'>A reminder is a nudge on a schedule that arrives in your bell and on your phone. Tasks are kept separate on the Tasks page.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <h3 style={{ marginTop: 0 }}>New reminder</h3>
        <ReminderForm action={addReminder} people={people} meId={user.id} />
      </div>
      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Your reminders</h3>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'tk-row-done'}>
                    <td className='c-title'>
                      <b>{r.title}</b>
                      {r.user_id !== user.id ? <span className='tk-own'>For {short(r.owner_name)}</span> : r.created_by && r.created_by !== user.id ? <span className='tk-own tk-from'>From {short(r.by_name)}</span> : null}
                      {r.active ? null : <span className='tk-own'>{r.kind === 'once' ? 'Sent' : 'Paused'}</span>}
                      {r.note ? <div className='muted'>{r.note}</div> : null}
                    </td>
                    <td className='c-meta'>{when(r)}</td>
                    <td className='act tk-act'>
                      {r.kind === 'once' && !r.active ? null : (
                        <form action={toggleReminder} className='inline'>
                          <input type='hidden' name='id' value={r.id} />
                          <button className='btn' type='submit'>{r.active ? 'Pause' : 'Resume'}</button>
                        </form>
                      )}
                      {canRemove(r) ? (
                        <form action={deleteReminder} className='inline'>
                          <input type='hidden' name='id' value={r.id} />
                          <ConfirmButton className='btn ghost' message='Remove this reminder?'>Remove</ConfirmButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No reminders yet. Add one above.</p>}
      </div>
    </>
  );
}
