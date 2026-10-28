'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { ATT_ROLES, allOffices, validDate, validTime } from './att';
import { can } from './perms';
import { notifyRoles, notifyUser } from './notify';
import { VLABEL, OM_TAG_LABEL, canEditVisitor, V_COLS, V_FROM } from './visitors';

const s = (fd, k) => String(fd.get(k) ?? '').trim();

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!ATT_ROLES.includes(u.role)) redirect('/');
  return u;
}
async function needOm() {
  const u = await need();
  if (u.role !== 'om') redirect('/visitors');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}
const isFuture = async (d, t) =>
  Number((await q(`SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`, [d, t]))[0].ms) > Date.now() + 60000;

// Record a visitor coming in. Everyone who uses AttendTrack (guards, Support Officers, managers) can do this.
export async function addVisitor(fd) {
  const u = await need();
  const name = s(fd, 'name').slice(0, 80);
  const vtype = s(fd, 'vtype');
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!name) back('/visitors', 'Enter the visitor\'s name');
  if (!VLABEL[vtype]) back('/visitors', 'Choose the type of visit');
  if (!validDate(date) || !validTime(time)) back('/visitors', 'Choose a valid date and time');
  if (await isFuture(date, time)) back('/visitors', 'That time is in the future');
  const code = allOffices(u) ? s(fd, 'office') : u.office_code;
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [code]))[0];
  if (!off) back('/visitors', 'Choose the office');
  const r = await q(
    `INSERT INTO pc2_visitors (office_id, name, phone, company, vtype, host, purpose, badge, in_at, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, ($9::date + $10::time) AT TIME ZONE 'Asia/Karachi', $11) RETURNING id`,
    [off.id, name, s(fd, 'phone').slice(0, 30), s(fd, 'company').slice(0, 80), vtype, s(fd, 'host').slice(0, 200), s(fd, 'purpose').slice(0, 200), s(fd, 'badge').slice(0, 20), date, time, u.id]
  );
  await logEvent(u, 'create', 'visitor', r[0].id, 'Visitor in: ' + name + ' (' + VLABEL[vtype] + ', ' + off.code + ') ' + date + ' ' + time, null, { name, vtype, host: s(fd, 'host') });
  back('/visitors', name + ' checked in at ' + time, true);
}

// Record a visitor going out (time defaults to now on the form).
export async function checkOutVisitor(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!validDate(date) || !validTime(time)) back('/visitors', 'Choose a valid date and time');
  const v = (await q(`SELECT v.id, v.name, v.office_id, v.out_at, (extract(epoch from v.in_at) * 1000)::float8 AS in_ms FROM pc2_visitors v WHERE v.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!v) back('/visitors', 'Visitor not found');
  if (!allOffices(u) && u.office_id !== v.office_id) back('/visitors', 'That visitor is in the other office');
  if (v.out_at) back('/visitors', v.name + ' is already checked out');
  const ms = Number((await q(`SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`, [date, time]))[0].ms);
  if (ms > Date.now() + 60000) back('/visitors', 'That time is in the future');
  if (ms < Number(v.in_ms)) back('/visitors', 'The check out is before the check in');
  await q(`UPDATE pc2_visitors SET out_at = ($1::date + $2::time) AT TIME ZONE 'Asia/Karachi', out_by = $3 WHERE id = $4`, [date, time, u.id, v.id]);
  await logEvent(u, 'edit', 'visitor', v.id, 'Visitor out: ' + v.name + ' ' + date + ' ' + time, null, { out: date + ' ' + time });
  back('/visitors', v.name + ' checked out at ' + time, true);
}

// Sr. Ops Manager: correct a visitor record.
export async function editVisitor(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const here = '/visitors/edit?id=' + id;
  const cur = (await q(`SELECT ${V_COLS} ${V_FROM} WHERE v.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!cur) back('/visitors', 'Visitor not found');
  if (!can(u, 'vis_log') && u.role !== 'om' && !canEditVisitor(u, cur)) back('/visitors', 'You can change a visitor you checked in yourself within 36 hours');
  if (!allOffices(u) && u.office_id !== cur.office_id) back('/visitors', 'That visitor is in the other office');
  const done = can(u, 'vis_log') ? '/visitors/log' : '/visitors';
  const name = s(fd, 'name').slice(0, 80);
  const vtype = s(fd, 'vtype');
  if (!name || !VLABEL[vtype]) back(here, 'Enter the name and choose the type');
  const inD = s(fd, 'in_date');
  const inT = s(fd, 'in_time');
  const outD = s(fd, 'out_date');
  const outT = s(fd, 'out_time');
  if (!validDate(inD) || !validTime(inT)) back(here, 'Choose a valid check in date and time');
  const hasOut = !!(outD || outT);
  if (hasOut && (!validDate(outD) || !validTime(outT))) back(here, 'Choose a valid check out date and time, or clear both');
  const off = (await q('SELECT id FROM pc2_offices WHERE code = $1', [allOffices(u) ? s(fd, 'office') : u.office_code]))[0];
  if (!off) back(here, 'Choose the office');
  if (hasOut && inD + inT > outD + outT) back(here, 'The check out is before the check in');
  await q(
    `UPDATE pc2_visitors SET office_id = $1, name = $2, phone = $3, company = $4, vtype = $5, host = $6, purpose = $7, badge = $8,
       in_at = ($9::date + $10::time) AT TIME ZONE 'Asia/Karachi', out_at = ($11::date + $12::time) AT TIME ZONE 'Asia/Karachi' WHERE id = $13`,
    [off.id, name, s(fd, 'phone').slice(0, 30), s(fd, 'company').slice(0, 80), vtype, s(fd, 'host').slice(0, 200), s(fd, 'purpose').slice(0, 200), s(fd, 'badge').slice(0, 20), inD, inT, outD || null, outT || null, id]
  );
  await logEvent(u, 'edit', 'visitor', id, 'Edited visitor record: ' + name, null, { vtype });
  back(done, 'Visitor record updated', true);
}

export async function deleteVisitor(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const v = (await q('SELECT name FROM pc2_visitors WHERE id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!v) back('/visitors/log', 'Visitor not found');
  await q('DELETE FROM pc2_visitors WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'visitor', id, 'Deleted visitor record: ' + v.name, null, null);
  back('/visitors/log', 'Visitor record deleted', true);
}

// Anyone who may edit a record can ask for it to be deleted; the Sr. Ops Manager approves or keeps it.
export async function requestVisitorDelete(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const reason = s(fd, 'reason').slice(0, 200);
  const here = '/visitors/edit?id=' + id;
  const v = (await q(`SELECT ${V_COLS} ${V_FROM} WHERE v.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!v) back('/visitors', 'Visitor not found');
  if (!canEditVisitor(u, v)) back('/visitors', 'You can only ask to delete a visitor you checked in yourself within 36 hours');
  if (!reason) back(here, 'Write a short reason for the delete request');
  await q('UPDATE pc2_visitors SET del_req_by = $1, del_req_at = now(), del_reason = $2 WHERE id = $3', [u.id, reason, id]);
  await logEvent(u, 'edit', 'visitor', id, 'Asked to delete visitor record: ' + v.name + ' (' + reason + ')', null, null);
  await notifyRoles(['om'], u.name + ' asked to delete the visitor record of ' + v.name + ': ' + reason, '/visitors/log', u.id);
  back('/visitors', 'Delete request sent to the Sr. Ops Manager', true);
}

export async function cancelVisitorDelete(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const v = (await q('SELECT name, del_req_by FROM pc2_visitors WHERE id = $1 AND del_req_by IS NOT NULL', [Number.isInteger(id) ? id : 0]))[0];
  if (!v) back('/visitors', 'No delete request found');
  if (u.role !== 'om' && v.del_req_by !== u.id) back('/visitors', 'Only the person who asked can cancel the request');
  await q('UPDATE pc2_visitors SET del_req_by = NULL, del_req_at = NULL, del_reason = NULL WHERE id = $1', [id]);
  back(u.role === 'om' ? '/visitors/log' : '/visitors', 'Delete request cancelled', true);
}

// Sr. Ops Manager: approve (the record is deleted) or keep the record.
export async function decideVisitorDelete(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const approve = s(fd, 'decision') === 'approve';
  const to = s(fd, 'back') === '/approvals' ? '/approvals' : '/visitors/log';
  const v = (await q('SELECT name, del_req_by FROM pc2_visitors WHERE id = $1 AND del_req_by IS NOT NULL', [Number.isInteger(id) ? id : 0]))[0];
  if (!v) back(to, 'That request was already handled');
  if (approve) {
    await q('DELETE FROM pc2_visitors WHERE id = $1', [id]);
    await logEvent(u, 'delete', 'visitor', id, 'Approved the delete request and removed visitor record: ' + v.name, null, null);
  } else {
    await q('UPDATE pc2_visitors SET del_req_by = NULL, del_req_at = NULL, del_reason = NULL WHERE id = $1', [id]);
    await logEvent(u, 'edit', 'visitor', id, 'Kept visitor record ' + v.name + ' (delete request declined)', null, null);
  }
  if (v.del_req_by && v.del_req_by !== u.id) await notifyUser(v.del_req_by, 'Your request to delete the visitor record of ' + v.name + ' was ' + (approve ? 'approved' : 'declined'), '/visitors');
  back(to, approve ? 'Record deleted' : 'Record kept', true);
}

// Imran, Zubair or the Sr. Ops Manager announce a visitor who is expected. It waits in the queue until the guard marks it.
export async function addExpected(fd) {
  const u = await need();
  if (u.role === 'guard') redirect('/visitors');
  const name = s(fd, 'name').slice(0, 80);
  const vtype = s(fd, 'vtype');
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!name) back('/visitors', "Enter the visitor's name");
  if (!VLABEL[vtype]) back('/visitors', 'Choose the type of visit');
  if (!validDate(date) || !validTime(time)) back('/visitors', 'Choose a valid date and time');
  const code = allOffices(u) ? s(fd, 'office') : u.office_code;
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [code]))[0];
  if (!off) back('/visitors', 'Choose the office');
  const r = await q(
    `INSERT INTO pc2_expected (office_id, name, phone, company, vtype, host, purpose, due_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7, ($8::date + $9::time) AT TIME ZONE 'Asia/Karachi', $10) RETURNING id`,
    [off.id, name, s(fd, 'phone').slice(0, 30), s(fd, 'company').slice(0, 80), vtype, s(fd, 'host').slice(0, 200), s(fd, 'purpose').slice(0, 200), date, time, u.id]
  );
  await logEvent(u, 'create', 'visitor', r[0].id, 'Visitor expected: ' + name + ' (' + VLABEL[vtype] + ', ' + off.code + ') ' + date + ' ' + time, null, { name, vtype });
  back('/visitors', name + ' added to the visitor queue for ' + time, true);
}

// Change an expected visitor who has not arrived yet.
export async function editExpected(fd) {
  const u = await need();
  if (u.role === 'guard') redirect('/visitors');
  const id = Number(s(fd, 'id'));
  const here = '/visitors/expected?id=' + id;
  const cur = (await q("SELECT id, name, office_id FROM pc2_expected WHERE id = $1 AND status = 'waiting'", [Number.isInteger(id) ? id : 0]))[0];
  if (!cur) back('/visitors', 'That visitor is no longer in the queue');
  if (!allOffices(u) && u.office_id !== cur.office_id) back('/visitors', 'That visitor is in the other office');
  const name = s(fd, 'name').slice(0, 80);
  const vtype = s(fd, 'vtype');
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!name) back(here, "Enter the visitor's name");
  if (!VLABEL[vtype]) back(here, 'Choose the type of visit');
  if (!validDate(date) || !validTime(time)) back(here, 'Choose a valid date and time');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [allOffices(u) ? s(fd, 'office') : u.office_code]))[0];
  if (!off) back(here, 'Choose the office');
  await q(
    `UPDATE pc2_expected SET office_id = $1, name = $2, phone = $3, company = $4, vtype = $5, host = $6, purpose = $7, due_at = ($8::date + $9::time) AT TIME ZONE 'Asia/Karachi' WHERE id = $10`,
    [off.id, name, s(fd, 'phone').slice(0, 30), s(fd, 'company').slice(0, 80), vtype, s(fd, 'host').slice(0, 200), s(fd, 'purpose').slice(0, 200), date, time, id]
  );
  await logEvent(u, 'edit', 'visitor', id, 'Edited expected visitor: ' + name + ' (' + off.code + ') ' + date + ' ' + time, null, { name, vtype });
  back('/visitors', 'Expected visitor updated', true);
}

async function queued(u, fd) {
  const id = Number(s(fd, 'id'));
  const e = (await q('SELECT e.* FROM pc2_expected e WHERE e.id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!e) back('/visitors', 'That visitor is not in the queue');
  if (!allOffices(u) && u.office_id !== e.office_id) back('/visitors', 'That visitor is in the other office');
  if (e.status !== 'waiting') back('/visitors', e.name + ' was already marked');
  return e;
}

// The guard marks that the visitor arrived: the visit is recorded and leaves the queue.
export async function markArrived(fd) {
  const u = await need();
  const e = await queued(u, fd);
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!validDate(date) || !validTime(time)) back('/visitors', 'Choose a valid date and time');
  if (await isFuture(date, time)) back('/visitors', 'That time is in the future');
  const r = await q(
    `INSERT INTO pc2_visitors (office_id, name, phone, company, vtype, host, purpose, remarks, badge, in_at, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, ($10::date + $11::time) AT TIME ZONE 'Asia/Karachi', $12) RETURNING id`,
    [e.office_id, e.name, e.phone, e.company, e.vtype, e.host, e.purpose, s(fd, 'remarks').slice(0, 200), s(fd, 'badge').slice(0, 20), date, time, u.id]
  );
  await q(`UPDATE pc2_expected SET status = 'arrived', visitor_id = $1, marked_by = $2, marked_at = now() WHERE id = $3`, [r[0].id, u.id, e.id]);
  await logEvent(u, 'create', 'visitor', r[0].id, 'Visitor in (from queue): ' + e.name + ' ' + date + ' ' + time, null, { name: e.name, queue: e.id });
  if (e.created_by && e.created_by !== u.id) await notifyUser(e.created_by, e.name + ' has arrived' + (e.host ? ' to meet ' + e.host : ''), '/visitors');
  back('/visitors', e.name + ' arrived at ' + time, true);
}

// The guard marks that the visitor did not come.
export async function markNoShow(fd) {
  const u = await need();
  const e = await queued(u, fd);
  await q(`UPDATE pc2_expected SET status = 'noshow', marked_by = $1, marked_at = now(), remarks = $2 WHERE id = $3`, [u.id, s(fd, 'remarks').slice(0, 200), e.id]);
  await logEvent(u, 'edit', 'visitor', e.id, 'Visitor did not show: ' + e.name, null, null);
  if (e.created_by && e.created_by !== u.id) await notifyUser(e.created_by, e.name + ' did not show up', '/visitors/log');
  back('/visitors', e.name + ' marked as no show', true);
}

// Whoever announced a visitor (or the Sr. Ops Manager / Sr. Support Officer) can take it out of the queue.
export async function cancelExpected(fd) {
  const u = await need();
  const e = await queued(u, fd);
  if (u.role !== 'om' && u.role !== 'sso' && e.created_by !== u.id) back('/visitors', 'Only the person who added the visitor can remove it');
  await q('DELETE FROM pc2_expected WHERE id = $1', [e.id]);
  await logEvent(u, 'delete', 'visitor', e.id, 'Removed expected visitor: ' + e.name, null, null);
  back('/visitors', e.name + ' removed from the queue', true);
}

// Sr. Ops Manager: tag a visitor record and add a remark (supporting note for the guards).
export async function tagVisitor(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const to = s(fd, 'to') === '/visitors/log' ? '/visitors/log' : '/visitors';
  const tag = OM_TAG_LABEL[s(fd, 'tag')] ? s(fd, 'tag') : '';
  const note = s(fd, 'note').slice(0, 200);
  const r = Number.isInteger(id) ? await q('UPDATE pc2_visitors SET om_tag = $1, om_note = $2 WHERE id = $3 RETURNING name', [tag, note, id]) : [];
  if (!r[0]) back(to, 'Visitor not found');
  await logEvent(u, 'edit', 'visitor', id, 'Tagged visitor record of ' + r[0].name + (tag ? ': ' + OM_TAG_LABEL[tag] : ': tag cleared') + (note ? ' (' + note + ')' : ''), null, { tag, note });
  back(to, tag || note ? 'Tag saved' : 'Tag cleared', true);
}
