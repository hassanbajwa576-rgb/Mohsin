'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { ATT_ROLES, allOffices, validDate, validTime } from './att';
import { can } from './perms';
import { VLABEL, canEditVisitor, V_COLS, V_FROM } from './visitors';

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
  if (u.role !== 'om' && !can(u, 'vis_log')) redirect('/visitors');
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
    [off.id, name, s(fd, 'phone').slice(0, 30), s(fd, 'company').slice(0, 80), vtype, s(fd, 'host').slice(0, 80), s(fd, 'purpose').slice(0, 200), s(fd, 'badge').slice(0, 20), date, time, u.id]
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
       in_at = ($9::date + $10::time) AT TIME ZONE 'Asia/Karachi', out_at = ${hasOut ? "($11::date + $12::time) AT TIME ZONE 'Asia/Karachi'" : 'NULL'} WHERE id = $13`,
    [off.id, name, s(fd, 'phone').slice(0, 30), s(fd, 'company').slice(0, 80), vtype, s(fd, 'host').slice(0, 80), s(fd, 'purpose').slice(0, 200), s(fd, 'badge').slice(0, 20), inD, inT, outD || null, outT || null, id]
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