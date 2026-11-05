'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { can } from './perms';
import { notifyUser } from './notify';
import { PRIORITY, DOMAIN, taskPeople } from './tasks';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const badDate = (d) => d.length !== 10 || Number.isNaN(Date.parse(d));

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, 'tasks')) redirect('/');
  const people = await taskPeople(u);
  return { u, people, mine: [u.id, ...people.map((p) => p.id)] };
}

// Back to the list with the same person, area and filter the person was looking at.
function back(fd, msg, ok) {
  const p = new URLSearchParams();
  if (s(fd, 'view_who')) p.set('who', s(fd, 'view_who'));
  if (DOMAIN[s(fd, 'view_domain')]) p.set('domain', s(fd, 'view_domain'));
  if (['done', 'all'].includes(s(fd, 'show'))) p.set('show', s(fd, 'show'));
  p.set(ok ? 'ok' : 'err', msg);
  redirect('/tasks?' + p.toString());
}

function read(fd) {
  const title = s(fd, 'title').slice(0, 200);
  const details = s(fd, 'details').slice(0, 1000);
  const due = s(fd, 'due_on');
  const priority = PRIORITY[s(fd, 'priority')] ? s(fd, 'priority') : 'medium';
  const domain = DOMAIN[s(fd, 'domain')] ? s(fd, 'domain') : 'operations';
  if (!title) back(fd, 'Write the task');
  if (due && badDate(due)) back(fd, 'Pick a valid due date');
  return { title, details, due: due || null, priority, domain };
}

// Who the task is for: the person asking, or someone they are allowed to give tasks to.
const ownerOf = (u, people, fd) => {
  const want = Number(s(fd, 'assign_to'));
  return want && want !== u.id && people.some((p) => p.id === want) ? want : u.id;
};

export async function addTask(fd) {
  const { u, people } = await need();
  const t = read(fd);
  const owner = ownerOf(u, people, fd);
  await q('INSERT INTO pc2_tasks (user_id, created_by, title, details, due_on, priority, domain) VALUES ($1,$2,$3,$4,$5,$6,$7)', [owner, u.id, t.title, t.details, t.due, t.priority, t.domain]);
  if (owner !== u.id) await notifyUser(owner, u.name + ' gave you a task: ' + t.title + (t.due ? ' (due ' + t.due + ')' : ''), '/tasks');
  const who = owner === u.id ? '' : people.find((p) => p.id === owner).name + ' - ';
  back(fd, 'Task added: ' + who + DOMAIN[t.domain], true);
}

export async function saveTask(fd) {
  const { u, people, mine } = await need();
  const id = Number(s(fd, 'id'));
  const t = read(fd);
  const status = s(fd, 'status') === 'done' ? 'done' : 'open';
  const before = (await q('SELECT user_id FROM pc2_tasks WHERE id = $1 AND user_id = ANY($2::int[])', [id, mine]))[0];
  if (!before) back(fd, 'Task not found');
  const owner = s(fd, 'assign_to') ? ownerOf(u, people, fd) : before.user_id;
  await q(
    `UPDATE pc2_tasks SET title = $1, details = $2, due_on = $3, priority = $4, domain = $5, status = $6, user_id = $7, done_at = CASE WHEN $6 = 'done' THEN COALESCE(done_at, now()) ELSE NULL END WHERE id = $8`,
    [t.title, t.details, t.due, t.priority, t.domain, status, owner, id]
  );
  if (owner !== before.user_id && owner !== u.id) await notifyUser(owner, u.name + ' gave you a task: ' + t.title, '/tasks');
  back(fd, 'Task updated', true);
}

export async function toggleTask(fd) {
  const { u, mine } = await need();
  const id = Number(s(fd, 'id'));
  const r = (await q(
    `UPDATE pc2_tasks SET status = CASE WHEN status = 'open' THEN 'done' ELSE 'open' END, done_at = CASE WHEN status = 'open' THEN now() ELSE NULL END
     WHERE id = $1 AND user_id = ANY($2::int[]) RETURNING title, status, user_id, created_by`,
    [id, mine]
  ))[0];
  // Tell the person who gave the task when it is finished.
  if (r && r.status === 'done' && r.created_by && r.created_by !== u.id) await notifyUser(r.created_by, u.name + ' finished the task: ' + r.title, '/tasks');
  back(fd, r ? 'Task updated' : 'Task not found', !!r);
}

// The person who created a task can remove it; the Sr. Ops Manager can remove any task he can see.
export async function deleteTask(fd) {
  const { u, mine } = await need();
  const id = Number(s(fd, 'id'));
  await q('DELETE FROM pc2_tasks WHERE id = $1 AND (created_by = $2 OR ($3 AND user_id = ANY($4::int[])))', [id, u.id, u.role === 'om', mine]);
  back(fd, 'Task removed', true);
}
