'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { ATT_ROLES, KIND_LABEL, canSeeTimes, canEnterFor, firstBad, allEventsOf, validDate, validTime } from './att';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const PATHS = ['/attendance', '/attendance/logs'];

async function need(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (!roles.includes(u.role)) redirect(u.role === 'guard' ? '/attendance' : '/');
  return u;
}

function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

// Record a check in / check out / break out / break in for one employee.
// Anyone who may use OpsTrack can add; times are entered as Pakistan time.
export async function addEntry(fd) {
  const u = await need(ATT_ROLES);
  const see = canSeeTimes(u);
  const staffId = Number(s(fd, 'staff_id'));
  const kind = s(fd, 'kind');
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!KIND_LABEL[kind]) back('/attendance', 'Choose Check In, Check Out, Break Out or Break In');
  if (!validDate(date) || !validTime(time)) back('/attendance', 'Choose a valid date and time');

  const st = (await q(
    `SELECT s.id, s.name, s.office_id, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.id = $1 AND s.active`,
    [Number.isInteger(staffId) ? staffId : 0]
  ))[0];
  if (!st) back('/attendance', 'Select an employee');
  if (!canEnterFor(u, st.office_id)) back('/attendance', 'You can only record entries for your own office');

  const ms = Number((await q(
    `SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`,
    [date, time]
  ))[0].ms);
  if (ms > Date.now() + 60000) back('/attendance', 'That time is in the future');

  // The whole history, with the new entry slotted in, must still be a valid in / break / out order.
  const hist = await allEventsOf(st.id);
  const cand = { id: Number.MAX_SAFE_INTEGER, kind, ms };
  const seq = hist.concat(cand).sort((a, b) => Number(a.ms) - Number(b.ms) || a.id - b.id);
  const bad = firstBad(seq);
  if (bad) {
    const e = seq[bad.i];
    if (e === cand) {
      const was = { off: 'not checked in', on: 'on duty', break: 'on a break' }[bad.state];
      back('/attendance', st.name + ' is ' + was + (see ? ' at ' + time : ' at that time') + ', so ' + KIND_LABEL[kind] + ' cannot be recorded');
    }
    back('/attendance', see
      ? 'That conflicts with an existing ' + KIND_LABEL[e.kind] + ' entry for ' + st.name
      : 'That time conflicts with an existing entry for ' + st.name + '. Check the time and try again.');
  }

  const ins = await q(
    `INSERT INTO pc2_attendance (staff_id, office_id, kind, at, entered_by) VALUES ($1, $2, $3, ($4::date + $5::time) AT TIME ZONE 'Asia/Karachi', $6) RETURNING id`,
    [st.id, st.office_id, kind, date, time, u.id]
  );
  await logEvent(u, 'create', 'attendance', ins[0].id, KIND_LABEL[kind] + ' - ' + st.name + ' (' + st.office + ') on ' + date + ' at ' + time, null,
    { staff: st.name, office: st.office, kind, date, time });
  back('/attendance', see ? st.name + ': ' + KIND_LABEL[kind] + ' recorded at ' + time : st.name + ': ' + KIND_LABEL[kind] + ' recorded', true);
}

// Delete an entry: the Sr. OM can remove any entry; Support Officers and guards can only undo their
// own within 30 minutes. The Sr. SO cannot delete entries.
export async function removeEntry(fd) {
  const u = await need(ATT_ROLES);
  const id = Number(s(fd, 'id'));
  const to = PATHS.includes(s(fd, 'back')) ? s(fd, 'back') : '/attendance';
  const r = (await q(
    `SELECT a.id, a.entered_by, a.kind, s.name, o.code AS office, to_char(a.at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at_txt, (a.entered_at > now() - interval '30 minutes') AS fresh
     FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id JOIN pc2_offices o ON o.id = a.office_id WHERE a.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!r) back(to, 'Entry not found');
  const allowed = u.role === 'om' || (u.role !== 'sso' && r.entered_by === u.id && r.fresh);
  if (!allowed) back(to, 'You can only undo your own entries within 30 minutes');
  await q('DELETE FROM pc2_attendance WHERE id = $1', [r.id]);
  await logEvent(u, 'delete', 'attendance', r.id, 'Removed ' + KIND_LABEL[r.kind] + ' - ' + r.name + ' (' + r.office + ') ' + r.at_txt, { staff: r.name, kind: r.kind, at: r.at_txt }, null);
  back(to, 'Entry removed', true);
}

/* ---------- employees (Sr. Ops Manager only) ---------- */

export async function addStaff(fd) {
  const u = await need(['om']);
  const name = s(fd, 'name');
  let code = s(fd, 'code');
  const dept = s(fd, 'dept');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!name) back('/attendance/staff', 'Enter the employee name');
  if (!code) {
    // No code given: use the next free number (001, 002, ...)
    const nx = await q(`SELECT COALESCE(MAX(CASE WHEN code ~ '^[0-9]+$' THEN code::int END), 0) + 1 AS n FROM pc2_staff`);
    code = String(nx[0].n).padStart(3, '0');
  }
  if (!off) back('/attendance/staff', 'Pick an office');
  let failed = false;
  let id = null;
  try {
    id = (await q('INSERT INTO pc2_staff (code, name, dept, office_id) VALUES ($1,$2,$3,$4) RETURNING id', [code, name, dept, off.id]))[0].id;
  } catch {
    failed = true;
  }
  if (failed) back('/attendance/staff', 'That employee code is already in use');
  await logEvent(u, 'create', 'staff', id, 'Added employee ' + name + ' #' + code + ' (' + off.code + ')', null, { name, code, dept, office: off.code });
  back('/attendance/staff', 'Employee added', true);
}

export async function updateStaff(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const name = s(fd, 'name');
  let code = s(fd, 'code');
  const dept = s(fd, 'dept');
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!code) {
    const cur = (await q('SELECT code FROM pc2_staff WHERE id = $1', [id]))[0];
    code = cur ? cur.code : '';
  }
  if (!name || !code || !off) back('/attendance/staff', 'Enter the name and office');
  let failed = false;
  try {
    await q('UPDATE pc2_staff SET name = $1, code = $2, dept = $3, office_id = $4 WHERE id = $5', [name, code, dept, off.id, id]);
  } catch {
    failed = true;
  }
  if (failed) back('/attendance/staff', 'That employee code is already in use');
  await logEvent(u, 'edit', 'staff', id, 'Edited employee ' + name + ' #' + code + ' (' + off.code + ')', null, { name, code, dept, office: off.code });
  back('/attendance/staff', 'Employee updated', true);
}

export async function toggleStaff(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const r = await q('UPDATE pc2_staff SET active = NOT active WHERE id = $1 RETURNING name, active', [id]);
  if (r[0]) await logEvent(u, 'update', 'staff', id, (r[0].active ? 'Activated ' : 'Deactivated ') + r[0].name);
  back('/attendance/staff', 'Employee updated', true);
}
