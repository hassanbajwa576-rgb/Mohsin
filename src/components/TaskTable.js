import Link from 'next/link';
import ConfirmButton from '@/components/ConfirmButton';
import { toggleTask, deleteTask } from '@/lib/task-actions';
import { PRIORITY, SOURCE, DOMAIN, dueLabel } from '@/lib/tasks';

// A list of tasks: the task, its area and priority, the due date, and Done / Edit / Remove. view and show remember the page's filters.
export default function TaskTable({ rows, today, view = '', show = '' }) {
  return (
    <div className='tablewrap'>
      <table className='tx'>
        <thead><tr><th>Task</th><th>Area</th><th>Priority</th><th className='r'>Due</th><th></th></tr></thead>
        <tbody>
          {rows.map((t) => {
            const d = dueLabel(t, today);
            return (
              <tr key={t.id} className={t.status === 'done' ? 'tk-row-done' : ''}>
                <td className='c-title'><b>{t.title}</b>{t.details ? <div className='muted'>{t.details}</div> : null}</td>
                <td className='c-meta hide-m'><span className='tk-dom'>{DOMAIN[t.domain] || t.domain}</span></td>
                <td className='c-meta hide-m'><span className={'tk-pri tk-' + t.priority}>{PRIORITY[t.priority]}</span></td>
                <td className={'r nw c-amt ' + d.cls}><b>{d.text}</b></td>
                <td className='show-m'>
                  <span className='tk-dom'>{DOMAIN[t.domain] || t.domain}</span>
                  <span className={'tk-pri tk-' + t.priority}>{PRIORITY[t.priority]} priority</span>
                  {t.source !== 'manual' ? <span className='sub'>From {SOURCE[t.source] || t.source}</span> : null}
                </td>
                <td className='act'>
                  <form action={toggleTask} className='inline'>
                    <input type='hidden' name='id' value={t.id} />
                    <input type='hidden' name='view_domain' value={view} />
                    <input type='hidden' name='show' value={show} />
                    <button className={'btn' + (t.status === 'open' ? ' ok' : '')} type='submit'>{t.status === 'open' ? 'Done' : 'Reopen'}</button>
                  </form>
                  <Link className='btn' href={'/tasks/edit?id=' + t.id}>Edit</Link>
                  <form action={deleteTask} className='inline'>
                    <input type='hidden' name='id' value={t.id} />
                    <input type='hidden' name='view_domain' value={view} />
                    <input type='hidden' name='show' value={show} />
                    <ConfirmButton className='btn ghost' message='Remove this task?'>Remove</ConfirmButton>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
