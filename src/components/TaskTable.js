import Link from 'next/link';
import ConfirmButton from '@/components/ConfirmButton';
import { toggleTask, deleteTask } from '@/lib/task-actions';
import { PRIORITY, SOURCE, DOMAIN, REPEAT_SHORT, dueLabel, daysFrom } from '@/lib/tasks';
import { firstName } from '@/lib/names';

const short = firstName;

// Whose task it is, and who gave it: shown only when it is not simply the viewer's own.
function Owner({ t, me }) {
  if (t.user_id !== me) return <span className='tk-own'>For {short(t.owner_name)}</span>;
  if (t.created_by && t.created_by !== me && t.creator_name) return <span className='tk-own tk-from'>From {short(t.creator_name)}</span>;
  return null;
}

// A list of tasks: the task, its area, who it is for, its priority, the due date, and Done / Edit / Remove.
// view, show and who remember the page's filters; me is the person looking at the page.
export default function TaskTable({ rows, today, me, view = '', show = '', who = '', canRemove }) {
  const hidden = (id) => (
    <>
      <input type='hidden' name='id' value={id} />
      <input type='hidden' name='view_domain' value={view} />
      <input type='hidden' name='show' value={show} />
      <input type='hidden' name='view_who' value={who} />
    </>
  );
  return (
    <div className='tablewrap'>
      <table className='tx'>
        <thead><tr><th>Task</th><th>Area</th><th>Priority</th><th className='r'>Due</th><th></th></tr></thead>
        <tbody>
          {rows.map((t) => {
            const d = dueLabel(t, today);
            // How urgent an open task is: late, today or tomorrow, within a week, or just marked high.
            const n = t.status === 'open' && t.due_on ? daysFrom(today, t.due_on) : null;
            const urg = n === null ? (t.status === 'open' && t.priority === 'high' ? 'high' : '') : n < 0 ? 'late' : n <= 1 ? 'now' : n <= 7 ? 'soon' : '';
            return (
              <tr key={t.id} className={(t.status === 'done' ? 'tk-row-done' : '') + (urg ? ' tk-u-' + urg : '')}>
                <td className='c-title'><b>{t.title}</b><Owner t={t} me={me} />{t.repeat_every ? <span className='tk-own tk-rep'>Repeats {REPEAT_SHORT[t.repeat_every]}</span> : null}{t.details ? <div className='muted' style={{ whiteSpace: 'pre-line' }}>{t.details}</div> : null}</td>
                <td className='c-meta hide-m'><span className='tk-dom'>{DOMAIN[t.domain] || t.domain}</span></td>
                <td className='c-meta hide-m'><span className={'tk-pri tk-' + t.priority}>{PRIORITY[t.priority]}</span></td>
                <td className={'r nw c-amt ' + d.cls}><b>{d.text}</b>{n !== null && n >= 2 ? <small className='tk-in'>in {n} days</small> : null}</td>
                <td className='show-m'>
                  <span className='tk-dom'>{DOMAIN[t.domain] || t.domain}</span>
                  <span className={'tk-pri tk-' + t.priority}>{PRIORITY[t.priority]} priority</span>
                  {t.source !== 'manual' ? <span className='sub'>From {SOURCE[t.source] || t.source}</span> : null}
                </td>
                <td className='act tk-act'>
                  <form action={toggleTask} className='inline'>
                    {hidden(t.id)}
                    <button className={'btn' + (t.status === 'open' ? ' ok' : '')} type='submit'>{t.status === 'open' ? 'Done' : 'Reopen'}</button>
                  </form>
                  <Link className='btn' href={'/tasks/edit?id=' + t.id}>Edit</Link>
                  {canRemove(t) ? (
                    <form action={deleteTask} className='inline'>
                      {hidden(t.id)}
                      <ConfirmButton className='btn ghost' message='Remove this task?'>Remove</ConfirmButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
