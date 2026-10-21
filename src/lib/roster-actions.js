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
  if (!ATT_ROLES.includes(u.role) || !can(u, 'roster_edit')) redirect('/attendance/hk-roster');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

// Record time off for an employee between two dates (inclusive).
export async function addTimeOff(fd) {
  const u = await need();
  const m = s(fd, 'month');
  const here = '/attendance/hk-roster' + (m ? '?m=' + m : '');
  const name = s(fd, 'name');
  const kind = s(fd, 'kind');
  const from = s(fd, 'from');
  const hrs = s(fd, 'hours') ? Number(s(fd, 'hours')) : null;
  if (hrs !== null && !(hrs > 0 && hrs <= 24)) back(here, 'Hours must be more than 0 and at most 24');
  const to = hrs !== null ? from : s(fd, 'to') || from;
  if (!TLABEL[kind]) back(here, 'Choose the type of time off');
  if (!validDate(from) || !validDate(to) || to < from) back(here, 'Choose valid dates (the last day cannot be before the first)');
  if ((new Date(to) - new Date(from)) / 864e5 > 120) back(here, 'Time off can be at most 120 days at once');
  const found = await q('SELECT s.id, s.name, s.office_id FROM pc2_hk_people s WHERE s.active AND lower(s.name) = lower($1)', [name]);
  if (!found.length) back(here, 'Nobody in the HK team is called "' + name + '". Add them to the team first, or pick a name from the list.');
  if (found.length > 1) back(here, 'More than one HK team member is called "' + name + '". Ask Mohsin to make the names different.');
  const st = found[0];
  if (!allOffices(u) && st.office_id !== u.office_id) back(here, 'You can only record time off for your own office');
  // Hours for part of a day may share a day with other hours; a full day cannot overlap anything.
  const clash = await q(`SELECT to_char(from_date, 'YYYY-MM-DD') AS f, to_char(to_date, 'YYYY-MM-DD') AS t FROM pc2_hk_off WHERE hk_id = $1 AND from_date <= $3::date AND to_date >= $2::date ${hrs !== null ? 'AND hours IS NULL' : ''} LIMIT 1`, [st.id, from, to]);
  if (clash.length) back(here, st.name + ' already has time off from ' + clash[0].f + ' to ' + clash[0].t + '. Remove it first to change it.');
  const r = await q('INSERT INTO pc2_hk_off (hk_id, from_date, to_date, kind, note, created_by, hours) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [st.id, from, to, kind, s(fd, 'note').slice(0, 120), u.id, hrs]);
  await logEvent(u, 'create', 'timeoff', r[0].id, 'Time off: ' + st.name + ' ' + TLABEL[kind] + ' ' + from + (to !== from ? ' to ' + to : '') + (hrs !== null ? ' (' + hrs + ' h)' : ''), null, { kind, from, to, hours: hrs });
  back(here, st.name + ': ' + TLABEL[kind] + (hrs !== null ? ' ' + hrs + ' h' : '') + ' recorded', true);
}

export async function deleteTimeOff(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const m = s(fd, 'month');
  const here = '/attendance/hk-roster' + (m ? '?m=' + m : '');
  const r = (await q(`SELECT t.id, t.kind, to_char(t.from_date, 'YYYY-MM-DD') AS f, to_char(t.to_date, 'YYYY-MM-DD') AS t2, s.name, s.office_id FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id WHERE t.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!r) back(here, 'That entry no longer exists');
  if (!allOffices(u) && r.office_id !== u.office_id) back(here, 'You can only change time off for your own office');
  await q('DELETE FROM pc2_hk_off WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'timeoff', id, 'Removed time off: ' + r.name + ' ' + TLABEL[r.kind] + ' ' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : ''), null, null);
  back(here, 'Time off removed', true);
}

// Add someone to the housekeeping team (they are not on the Employees list and have no attendance entries).
export async function addHkPerson(fd) {
  const u = await need();
  const here = '/attendance/hk-roster';
  const name = s(fd, 'name').slice(0, 80);
  if (!name) back(here, 'Enter the name');
  const code = allOffices(u) ? s(fd, 'office') : u.office_code;
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [code]))[0];
  if (!off) back(here, 'Choose the office');
  const dup = await q('SELECT id FROM pc2_hk_people WHERE active AND lower(name) = lower($1)', [name]);
  if (dup.length) back(here, name + ' is already in the HK team');
  const r = await q('INSERT INTO pc2_hk_people (name, office_id, role, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [name, off.id, s(fd, 'role').slice(0, 60), u.id]);
  await logEvent(u, 'create', 'hk_person', r[0].id, 'Added to the HK team: ' + name + ' (' + off.code + ')', null, null);
  back(here, name + ' added to the HK team', true);
}

// Remove someone from the team (their past time off is kept out of view; the record stays in the database).
export async function removeHkPerson(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, office_id FROM pc2_hk_people WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back('/attendance/hk-roster', 'That person is no longer in the team');
  if (!allOffices(u) && p.office_id !== u.office_id) back('/attendance/hk-roster', 'You can only change your own office');
  await q('UPDATE pc2_hk_people SET active = FALSE WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'hk_person', id, 'Removed from the HK team: ' + p.name, null, null);
  back('/attendance/hk-roster', p.name + ' removed from the HK team', true);
}
