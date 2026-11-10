'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { can } from './perms';
import { notifyUser } from './notify';
import { taskPeople } from './tasks';
import { daysText } from './weekdays';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const KINDS = ['once', 'daily', 'days', 'm15', 'mend'];

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, 'tasks')) redirect('/');
  const people = await taskPeople(u);
  return { u, people, mine: [u.id, ...people.map((p) => p.id)] };
}
const back = (msg, ok) => redirect('/reminders?' + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));

export async function addReminder(fd) {
  const { u, people } = await need();
  const title = s(fd, 'title').slice(0, 200);
  const note = s(fd, 'note').slice(0, 300);
  const kind = KINDS.includes(s(fd, 'kind')) ? s(fd, 'kind') : 'once';
  const date = s(fd, 'on_date');
  const days = [...new Set(fd.getAll('days').map(String).filter((d) => /^[1-7]$/.test(d)))].sort().join(',');
  const tm = /^(\d{1,2}):(\d{2})/.exec(s(fd, 'time'));
  const hour = tm ? Math.min(23, Number(tm[1])) : 9;
  const minute = tm ? Math.min(59, Number(tm[2])) : 0;
  const want = Number(s(fd, 'assign_to'));
  const owner = want && want !== u.id && people.some((p) => p.id === want) ? want : u.id;
  if (!title) back('Write the reminder');
  if (kind === 'once' && (date.length !== 10 || Number.isNaN(Date.parse(date)))) back('Pick the date for a one-time reminder');
  if (kind === 'days' && !days) back('Tick at least one day');
  await q('INSERT INTO pc2_reminders (user_id, created_by, title, note, kind, on_date, weekdays, hour, minute) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [owner, u.id, title, note, kind, kind === 'once' ? date : null, kind === 'days' ? days : '', hour, minute]);
  if (owner !== u.id) await notifyUser(owner, u.name + ' set a reminder for you: ' + title + (kind === 'days' ? ' (' + daysText(days) + ')' : ''), '/reminders');
  back('Reminder added: ' + title, true);
}

export async function toggleReminder(fd) {
  const { mine } = await need();
  await q('UPDATE pc2_reminders SET active = NOT active WHERE id = $1 AND user_id = ANY($2::int[])', [Number(s(fd, 'id')), mine]);
  back('Reminder updated', true);
}

export async function deleteReminder(fd) {
  const { u, mine } = await need();
  await q('DELETE FROM pc2_reminders WHERE id = $1 AND (created_by = $2 OR ($3 AND user_id = ANY($4::int[])))', [Number(s(fd, 'id')), u.id, u.role === 'om', mine]);
  back('Reminder removed', true);
}
