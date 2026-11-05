'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { can } from './perms';
import { PRIORITY, DOMAIN } from './tasks';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const badDate = (d) => d.length !== 10 || Number.isNaN(Date.parse(d));

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, 'tasks')) redirect('/');
  return u;
}

// Back to the list with the same domain and filter the person was looking at.
function back(fd, msg, ok) {
  const p = new URLSearchParams();
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

export async function addTask(fd) {
  const u = await need();
  const t = read(fd);
  await q('INSERT INTO pc2_tasks (user_id, title, details, due_on, priority, domain) VALUES ($1,$2,$3,$4,$5,$6)', [u.id, t.title, t.details, t.due, t.priority, t.domain]);
  back(fd, 'Task added to ' + DOMAIN[t.domain], true);
}

export async function saveTask(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const t = read(fd);
  const status = s(fd, 'status') === 'done' ? 'done' : 'open';
  const r = await q(
    `UPDATE pc2_tasks SET title = $1, details = $2, due_on = $3, priority = $4, domain = $5, status = $6, done_at = CASE WHEN $6 = 'done' THEN COALESCE(done_at, now()) ELSE NULL END WHERE id = $7 AND user_id = $8 RETURNING id`,
    [t.title, t.details, t.due, t.priority, t.domain, status, id, u.id]
  );
  back(fd, r.length ? 'Task updated' : 'Task not found', !!r.length);
}

export async function toggleTask(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  await q(
    `UPDATE pc2_tasks SET status = CASE WHEN status = 'open' THEN 'done' ELSE 'open' END, done_at = CASE WHEN status = 'open' THEN now() ELSE NULL END WHERE id = $1 AND user_id = $2`,
    [id, u.id]
  );
  back(fd, 'Task updated', true);
}

export async function deleteTask(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  await q('DELETE FROM pc2_tasks WHERE id = $1 AND user_id = $2', [id, u.id]);
  back(fd, 'Task removed', true);
}
