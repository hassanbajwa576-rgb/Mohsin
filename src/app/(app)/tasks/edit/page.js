import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { taskPeople, taskOne } from '@/lib/tasks';
import { saveTask } from '@/lib/task-actions';
import TaskForm from '@/components/TaskForm';
import BackButton from '@/components/BackButton';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function EditTaskPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so']);
  if (!can(user, 'tasks')) redirect('/');
  const sp = await searchParams;
  const people = await taskPeople(user);
  const id = Number(sp.id);
  const task = await taskOne([user.id, ...people.map((p) => p.id)], Number.isInteger(id) ? id : 0);
  if (!task) redirect('/tasks');
  const who = task.user_id === user.id ? '' : String(task.user_id);
  return (
    <>
      <div className='head'>
        <div>
          <BackButton fallback='/tasks' label='Back to tasks' />
          <h1>Edit task</h1>
          <p className='muted'>{task.user_id === user.id ? 'Your task.' : 'Task for ' + task.owner_name + '.'}</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <TaskForm action={saveTask} task={task} view={task.domain} who={who} people={people} meId={user.id} label='Save changes' />
      </div>
    </>
  );
}
