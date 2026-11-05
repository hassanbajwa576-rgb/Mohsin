'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { can } from './perms';
import { notifyUser } from './notify';
import { PRIORITY, DOMAIN, REPEAT, taskPeople } from './tasks';
import { todayKey } from './att';
import { FIXED_KINDS, fixedOnOrAfter, fixedNext } from './task-repeat';
import { runRoutines } from './task-rules';
import { daysText } from './weekdays';

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

async function read(fd) {
  const title = s(fd, 'title').slice(0, 200);
  const details = s(fd, 'details').slice(0, 1000);
  const due = s(fd, 'due_on');
  const priority = PRIORITY[s(fd, 'priority')] ? s(fd, 'priority') : 'medium';
  const domain = DOMAIN[s(fd, 'domain')] ? s(fd, 'domain') : 'operations';
  if (!title) back(fd, 'Write the task');
  if (due && badDate(due)) back(fd, 'Pick a valid due date');
  const repeat = REPEAT[s(fd, 'repeat_every')] && s(fd, 'repeat_every') ? s(fd, 'repeat_every') : '';
  // A task that repeats on a fixed day starts on the first such day when no date was given.
  const first = !due && FIXED_KINDS.includes(repeat) ? await fixedOnOrAfter(repeat, todayKey()) : null;
  return { title, details, due: due || first || null, priority, domain, repeat };
}

// Who the task is for: the person asking, or someone they are allowed to give tasks to.
const ownerOf = (u, people, fd) => {
  const want = Number(s(fd, 'assign_to'));
  return want && want !== u.id && people.some((p) => p.id === want) ? want : u.id;
};

// The next date of a repeating task: one step after its due date, and never in the past.
function nextDate(from, kind, today) {
  const step = (d) => {
    const x = new Date(d + 'T00:00:00Z');
    if (kind === 'daily') x.setUTCDate(x.getUTCDate() + 1);
    else if (kind === 'weekly') x.setUTCDate(x.getUTCDate() + 7);
    else x.setUTCMonth(x.getUTCMonth() + 1);
    return x.toISOString().slice(0, 10);
  };
  let d = step(from || today);
  for (let i = 0; i < 400 && d <= today; i++) d = step(d);
  return d;
}

// Finishing a repeating task opens the next one (once).
async function openNext(r) {
  if (!r.repeat_every) return;
  const due = FIXED_KINDS.includes(r.repeat_every) ? await fixedNext(r.repeat_every, r.due_on, todayKey()) : nextDate(r.due_on, r.repeat_every, todayKey());
  const dup = await q(`SELECT 1 FROM pc2_tasks WHERE user_id = $1 AND title = $2 AND repeat_every = $3 AND status = 'open' AND due_on = $4::date LIMIT 1`, [r.user_id, r.title, r.repeat_every, due]);
  if (dup.length) return;
  await q(`INSERT INTO pc2_tasks (user_id, created_by, title, details, due_on, priority, domain, repeat_every) VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8)`, [r.user_id, r.created_by || r.user_id, r.title, r.details, due, r.priority, r.domain, r.repeat_every]);
}

// A finished task is reported to the person who gave it AND the person it is for (never to the person who just finished it).
async function tellDone(u, task) {
  const to = new Set([task.created_by, task.user_id]);
  to.delete(u.id);
  to.delete(null);
  for (const id of to) await notifyUser(id, u.name + ' finished the task: ' + task.title, '/tasks');
}

export async function addTask(fd) {
  const { u, people } = await need();
  const t = await read(fd);
  const owner = ownerOf(u, people, fd);
  // Days ticked under Routine: a rule that creates this task again on those weekdays, instead of one single task.
  const days = [...new Set(fd.getAll('routine_days').map(String).filter((d) => /^[1-7]$/.test(d)))].sort();
  if (days.length) {
    await q('INSERT INTO pc2_task_rules (user_id, created_by, title, details, priority, domain, weekdays) VALUES ($1,$2,$3,$4,$5,$6,$7)', [owner, u.id, t.title, t.details, t.priority, t.domain, days.join(',')]);
    await runRoutines(true);
    if (owner !== u.id) await notifyUser(owner, u.name + ' set a routine for you: ' + t.title + ' (' + daysText(days.join(',')) + ')', '/tasks');
    back(fd, 'Routine added: ' + t.title + ' - ' + daysText(days.join(',')), true);
  }
  await q('INSERT INTO pc2_tasks (user_id, created_by, title, details, due_on, priority, domain, repeat_every) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [owner, u.id, t.title, t.details, t.due, t.priority, t.domain, t.repeat]);
  if (owner !== u.id) await notifyUser(owner, u.name + ' gave you a task: ' + t.title + (t.due ? ' (due ' + t.due + ')' : ''), '/tasks');
  const who = owner === u.id ? '' : people.find((p) => p.id === owner).name + ' - ';
  back(fd, 'Task added: ' + who + DOMAIN[t.domain], true);
}

export async function saveTask(fd) {
  const { u, people, mine } = await need();
  const id = Number(s(fd, 'id'));
  const t = await read(fd);
  const status = s(fd, 'status') === 'done' ? 'done' : 'open';
  const before = (await q('SELECT user_id, created_by, status FROM pc2_tasks WHERE id = $1 AND user_id = ANY($2::int[])', [id, mine]))[0];
  if (!before) back(fd, 'Task not found');
  const owner = s(fd, 'assign_to') ? ownerOf(u, people, fd) : before.user_id;
  await q(
    `UPDATE pc2_tasks SET title = $1, details = $2, due_on = $3, priority = $4, domain = $5, status = $6, user_id = $7, repeat_every = $9, done_at = CASE WHEN $6 = 'done' THEN COALESCE(done_at, now()) ELSE NULL END WHERE id = $8`,
    [t.title, t.details, t.due, t.priority, t.domain, status, owner, id, t.repeat]
  );
  if (owner !== before.user_id && owner !== u.id) await notifyUser(owner, u.name + ' gave you a task: ' + t.title, '/tasks');
  if (status === 'done' && before.status !== 'done') {
    await tellDone(u, { title: t.title, created_by: before.created_by, user_id: owner });
    await openNext({ ...t, due_on: t.due, repeat_every: t.repeat, user_id: owner, created_by: before.created_by });
  }
  back(fd, 'Task updated', true);
}

export async function toggleTask(fd) {
  const { u, mine } = await need();
  const id = Number(s(fd, 'id'));
  const r = (await q(
    `UPDATE pc2_tasks SET status = CASE WHEN status = 'open' THEN 'done' ELSE 'open' END, done_at = CASE WHEN status = 'open' THEN now() ELSE NULL END
     WHERE id = $1 AND user_id = ANY($2::int[]) RETURNING title, details, priority, domain, repeat_every, to_char(due_on, 'YYYY-MM-DD') AS due_on, status, user_id, created_by`,
    [id, mine]
  ))[0];
  // Tell the giver and the person it is for (except whoever just finished it).
  if (r && r.status === 'done') {
    await tellDone(u, r);
    await openNext(r);
  }
  back(fd, r ? 'Task updated' : 'Task not found', !!r);
}

// The person who created a task can remove it; the Sr. Ops Manager can remove any task he can see.
export async function deleteTask(fd) {
  const { u, mine } = await need();
  const id = Number(s(fd, 'id'));
  await q('DELETE FROM pc2_tasks WHERE id = $1 AND (created_by = $2 OR ($3 AND user_id = ANY($4::int[])))', [id, u.id, u.role === 'om', mine]);
  back(fd, 'Task removed', true);
}

// Pause or resume a routine (for yourself or the people you manage).
export async function toggleRule(fd) {
  const { mine } = await need();
  const id = Number(s(fd, 'id'));
  await q('UPDATE pc2_task_rules SET active = NOT active WHERE id = $1 AND user_id = ANY($2::int[])', [id, mine]);
  back(fd, 'Routine updated', true);
}

// The person who set a routine up can remove it; the Sr. Ops Manager can remove any he can see.
export async function deleteRule(fd) {
  const { u, mine } = await need();
  const id = Number(s(fd, 'id'));
  await q('DELETE FROM pc2_task_rules WHERE id = $1 AND (created_by = $2 OR ($3 AND user_id = ANY($4::int[])))', [id, u.id, u.role === 'om', mine]);
  back(fd, 'Routine removed', true);
}