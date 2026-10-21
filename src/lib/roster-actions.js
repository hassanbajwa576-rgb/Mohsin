'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { ATT_ROLES, allOffices, validDate } from './att';
import { TLABEL } from './roster';

const s = (fd, k) => String(fd.get(k) ?? '').trim();

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!ATT_ROLES.includes(u.role) || !can(u, 'roster_edit')) redirect('/attendance/roster');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

// Record time off for an employee between two dates (inclusive).
export async function addTimeOff(fd) {
  const u = await need();
  const m = s(fd, 'month');
  const here = '/attendance/roster' + (m ? '?m=' + m : '');
  const name = s(fd, 'name');
  const kind = s(fd, 'kind');
  const from = s(fd, 'from');
  const to = s(fd, 'to') || from;
  if (!TLABEL[kind]) back(here, 'Choose the type of time off');
  if (!validDate(from) || !validDate(to) || to < from) back(here, 'Choose valid dates (the last day cannot be before the first)');
  if ((new Date(to) - new Date(from)) / 864e5 > 120) back(here, 'Time off can be at most 120 days at once');
  const found = await q('SELECT s.id, s.name, s.office_id FROM pc2_staff s WHERE s.active AND lower(s.name) = lower($1)', [name]);
  if (!found.length) back(here, 'No employee is called "' + name + '". Pick a name from the list.');
  if (found.length > 1) back(here, 'More than one employee is called "' + name + '". Ask Mohsin to make the names different.');
  const st = found[0];
  if (!allOffices(u) && st.office_id !== u.office_id) back(here, 'You can only record time off for your own office');
  const clash = await q(`SELECT to_char(from_date, 'YYYY-MM-DD') AS f, to_char(to_date, 'YYYY-MM-DD') AS t FROM pc2_timeoff WHERE staff_id = $1 AND from_date <= $3::date AND to_date >= $2::date LIMIT 1`, [st.id, from, to]);
  if (clash.length) back(here, st.name + ' already has time off from ' + clash[0].f + ' to ' + clash[0].t + '. Remove it first to change it.');
  const r = await q('INSERT INTO pc2_timeoff (staff_id, from_date, to_date, kind, note, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [st.id, from, to, kind, s(fd, 'note').slice(0, 120), u.id]);
  await logEvent(u, 'create', 'timeoff', r[0].id, 'Time off: ' + st.name + ' ' + TLABEL[kind] + ' ' + from + (to !== from ? ' to ' + to : ''), null, { kind, from, to });
  back(here, st.name + ': ' + TLABEL[kind] + ' recorded', true);
}

export async function deleteTimeOff(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const m = s(fd, 'month');
  const here = '/attendance/roster' + (m ? '?m=' + m : '');
  const r = (await q(`SELECT t.id, t.kind, to_char(t.from_date, 'YYYY-MM-DD') AS f, to_char(t.to_date, 'YYYY-MM-DD') AS t2, s.name, s.office_id FROM pc2_timeoff t JOIN pc2_staff s ON s.id = t.staff_id WHERE t.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!r) back(here, 'That entry no longer exists');
  if (!allOffices(u) && r.office_id !== u.office_id) back(here, 'You can only change time off for your own office');
  await q('DELETE FROM pc2_timeoff WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'timeoff', id, 'Removed time off: ' + r.name + ' ' + TLABEL[r.kind] + ' ' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : ''), null, null);
  back(here, 'Time off removed', true);
}