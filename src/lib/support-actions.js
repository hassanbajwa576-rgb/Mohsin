'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { SUPPORT_ROLES, validDate } from './att';
import { notifyRoles, notifyUser } from './notify';
import { PLABEL, CLABEL, isMgr, refOf, canSee, complaintById } from './support';

const s = (fd, k) => String(fd.get(k) ?? '').trim();

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!SUPPORT_ROLES.includes(u.role)) redirect('/');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}
const here = (id) => '/support/view?id=' + id;

async function load(u, fd) {
  const id = Number(s(fd, 'id'));
  const c = await complaintById(id);
  if (!c) back('/support/list', 'That complaint no longer exists');
  if (!canSee(u, c)) back('/support', 'You cannot open that complaint');
  return c;
}

// Add an update to the timeline. Everyone involved is told.
export async function addNote(fd) {
  const u = await need();
  const c = await load(u, fd);
  const note = s(fd, 'note').slice(0, 1000);
  if (!note) back(here(c.id), 'Write the update first');
  await q("INSERT INTO pc2_complaint_notes (complaint_id, user_id, note, kind) VALUES ($1, $2, $3, 'note')", [c.id, u.id, note]);
  const msg = u.name + ' added an update to ' + refOf(c.id) + ': ' + note.slice(0, 80);
  if (c.raised_by && c.raised_by !== u.id) await notifyUser(c.raised_by, msg, here(c.id));
  if (c.assigned_to && c.assigned_to !== u.id && c.assigned_to !== c.raised_by) await notifyUser(c.assigned_to, msg, here(c.id));
  back(here(c.id), 'Update added', true);
}

// Mohsin or Imran give the complaint to someone.
export async function assignComplaint(fd) {
  const u = await need();
  if (!isMgr(u)) back('/support', 'Only Mohsin or Imran can assign a complaint');
  const c = await load(u, fd);
  const to = Number(s(fd, 'assignee'));
  const who = (await q("SELECT id, name FROM pc2_users WHERE id = $1 AND active AND role <> 'guard'", [Number.isInteger(to) ? to : 0]))[0];
  if (!who) back(here(c.id), 'Choose who should handle it');
  await q('UPDATE pc2_complaints SET assigned_to = $1 WHERE id = $2', [who.id, c.id]);
  await q("INSERT INTO pc2_complaint_notes (complaint_id, user_id, note, kind) VALUES ($1, $2, $3, 'assign')", [c.id, u.id, 'Assigned to ' + who.name]);
  await logEvent(u, 'edit', 'complaint', c.id, refOf(c.id) + ' assigned to ' + who.name, null, null);
  if (who.id !== u.id) await notifyUser(who.id, u.name + ' assigned you ' + refOf(c.id) + ': ' + c.title, here(c.id));
  back(here(c.id), 'Assigned to ' + who.name, true);
}

// Mohsin or Imran tag the person whose floor or area it was, or who was responsible. Clearing both removes the tag.
export async function tagResponsible(fd) {
  const u = await need();
  if (!isMgr(u)) back('/support', 'Only Mohsin or Imran can tag a responsible person');
  const c = await load(u, fd);
  const hkId = Number(s(fd, 'hk'));
  const userId = Number(s(fd, 'ruser'));
  const hk = Number.isInteger(hkId) && hkId > 0 ? (await q('SELECT id, name FROM pc2_hk_people WHERE id = $1', [hkId]))[0] : null;
  const ru = Number.isInteger(userId) && userId > 0 ? (await q("SELECT id, name FROM pc2_users WHERE id = $1 AND active AND role <> 'guard'", [userId]))[0] : null;
  const note = s(fd, 'resp_note').slice(0, 200);
  await q('UPDATE pc2_complaints SET resp_hk_id = $1, resp_user_id = $2, resp_note = $3 WHERE id = $4', [hk ? hk.id : null, ru ? ru.id : null, note, c.id]);
  const names = [hk && hk.name, ru && ru.name].filter(Boolean).join(' and ');
  const text = names ? 'Tagged responsible: ' + names + (note ? ' (' + note + ')' : '') : 'Responsible person cleared';
  await q("INSERT INTO pc2_complaint_notes (complaint_id, user_id, note, kind) VALUES ($1, $2, $3, 'assign')", [c.id, u.id, text]);
  await logEvent(u, 'edit', 'complaint', c.id, refOf(c.id) + ': ' + text, null, null);
  if (ru && ru.id !== u.id) await notifyUser(ru.id, u.name + ' tagged you as responsible for ' + refOf(c.id) + ': ' + c.title, here(c.id));
  back(here(c.id), names ? 'Tagged ' + names : 'Tag cleared', true);
}

// Mohsin or Imran change the priority, category or due date.
export async function updateComplaint(fd) {
  const u = await need();
  if (!isMgr(u)) back('/support', 'Only Mohsin or Imran can change these');
  const c = await load(u, fd);
  const priority = PLABEL[s(fd, 'priority')] ? s(fd, 'priority') : c.priority;
  const category = CLABEL[s(fd, 'category')] ? s(fd, 'category') : c.category;
  const due = s(fd, 'due_on');
  if (!validDate(due)) back(here(c.id), 'Choose a valid due date');
  await q('UPDATE pc2_complaints SET priority = $1, category = $2, due_on = $3::date, reminded_on = NULL WHERE id = $4', [priority, category, due, c.id]);
  await q("INSERT INTO pc2_complaint_notes (complaint_id, user_id, note, kind) VALUES ($1, $2, $3, 'edit')", [c.id, u.id, 'Priority ' + PLABEL[priority] + ', ' + CLABEL[category] + ', due ' + due]);
  await logEvent(u, 'edit', 'complaint', c.id, refOf(c.id) + ' updated: ' + PLABEL[priority] + ', ' + CLABEL[category] + ', due ' + due, null, null);
  back(here(c.id), 'Complaint updated', true);
}

// The person handling it (or a manager) marks it resolved with a note on what was done.
export async function resolveComplaint(fd) {
  const u = await need();
  const c = await load(u, fd);
  if (!isMgr(u) && c.assigned_to !== u.id) back(here(c.id), 'Only the person handling it, Mohsin or Imran can resolve it');
  if (c.status === 'resolved') back(here(c.id), 'Already resolved');
  const resolution = s(fd, 'resolution').slice(0, 1000);
  if (!resolution) back(here(c.id), 'Write what was done to resolve it');
  await q("UPDATE pc2_complaints SET status = 'resolved', resolution = $1, resolved_by = $2, resolved_at = now() WHERE id = $3", [resolution, u.id, c.id]);
  await q("INSERT INTO pc2_complaint_notes (complaint_id, user_id, note, kind) VALUES ($1, $2, $3, 'resolve')", [c.id, u.id, 'Resolved: ' + resolution]);
  await logEvent(u, 'edit', 'complaint', c.id, refOf(c.id) + ' resolved: ' + resolution.slice(0, 80), null, null);
  if (c.raised_by && c.raised_by !== u.id) await notifyUser(c.raised_by, 'Your complaint ' + refOf(c.id) + ' was resolved: ' + resolution.slice(0, 80), here(c.id));
  if (!isMgr(u)) await notifyRoles(['om', 'sso'], u.name + ' resolved ' + refOf(c.id) + ': ' + c.title, here(c.id), u.id);
  back(here(c.id), 'Marked as resolved', true);
}

// Mohsin, Imran or the person who raised it can reopen it.
export async function reopenComplaint(fd) {
  const u = await need();
  const c = await load(u, fd);
  if (!isMgr(u) && c.raised_by !== u.id) back(here(c.id), 'Only the person who raised it, Mohsin or Imran can reopen it');
  if (c.status !== 'resolved') back(here(c.id), 'It is already open');
  const why = s(fd, 'why').slice(0, 500);
  await q("UPDATE pc2_complaints SET status = 'open', resolved_by = NULL, resolved_at = NULL, reminded_on = NULL WHERE id = $1", [c.id]);
  await q("INSERT INTO pc2_complaint_notes (complaint_id, user_id, note, kind) VALUES ($1, $2, $3, 'reopen')", [c.id, u.id, 'Reopened' + (why ? ': ' + why : '')]);
  await logEvent(u, 'edit', 'complaint', c.id, refOf(c.id) + ' reopened', null, null);
  const msg = u.name + ' reopened ' + refOf(c.id) + ': ' + c.title;
  if (c.assigned_to && c.assigned_to !== u.id) await notifyUser(c.assigned_to, msg, here(c.id));
  await notifyRoles(['om', 'sso'], msg, here(c.id), u.id);
  back(here(c.id), 'Complaint reopened', true);
}
