import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { taskOne } from '@/lib/tasks';
import { saveTask } from '@/lib/task-actions';
import TaskForm from '@/components/TaskForm';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function EditTaskPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so']);
  if (!can(user, 'tasks')) redirect('/');
  const sp = await searchParams;
  const id = Number(sp.id);
  const task = await taskOne(user.id, Number.isInteger(id) ? id : 0);
  if (!task) redirect('/tasks');
  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit task</h1>
          <p className='muted'>Only you can see your tasks.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <TaskForm action={saveTask} task={task} view={task.domain} label='Save changes' />
      </div>
    </>
  );
}
