'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { ATT_ROLES, KIND_LABEL, canSeeTimes, canEnterFor, firstBad, allEventsOf, validDate, validTime } from './att';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const PATHS = ['/attendance', '/attendance/logs'];

async function need(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!roles.includes(u.role)) redirect(u.role === 'guard' ? '/attendance' : '/');
  return u;
}

async function needPerm(key) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, key)) redirect(u.role === 'guard' ? '/attendance' : '/');
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
    `SELECT a.id, a.entered_by, a.kind, ub.role AS by_role, s.name, o.code AS office, to_char(a.at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at_txt, (a.entered_at > now() - interval '36 hours') AS fresh
     FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id JOIN pc2_offices o ON o.id = a.office_id LEFT JOIN pc2_users ub ON ub.id = a.entered_by WHERE a.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!r) back(to, 'Entry not found');
  const allowed = u.role === 'om' || (u.role === 'sso' && r.fresh && (r.entered_by === u.id || ['so', 'guard'].includes(r.by_role)));
  if (!allowed) back(to, 'Only the Sr. Ops Manager and Sr. Support Officer can delete entries (the Sr. Support Officer within 36 hours)');
  await q('DELETE FROM pc2_attendance WHERE id = $1', [r.id]);
  await logEvent(u, 'delete', 'attendance', r.id, 'Removed ' + KIND_LABEL[r.kind] + ' - ' + r.name + ' (' + r.office + ') ' + r.at_txt, { staff: r.name, kind: r.kind, at: r.at_txt }, null);
  back(to, 'Entry removed', true);
}

/* ---------- employees (Sr. Ops Manager only) ---------- */

export async function addStaff(fd) {
  const u = await needPerm('att_staff');
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
  const u = await needPerm('att_staff');
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
  const u = await needPerm('att_staff');
  const id = Number(s(fd, 'id'));
  const r = await q('UPDATE pc2_staff SET active = NOT active WHERE id = $1 RETURNING name, active', [id]);
  if (r[0]) await logEvent(u, 'update', 'staff', id, (r[0].active ? 'Activated ' : 'Deactivated ') + r[0].name);
  back('/attendance/staff', 'Employee updated', true);
}

// Bulk-add employees from an Excel sheet with the columns Name, Department, Office, Code (optional).
export async function importStaff(fd) {
  const u = await needPerm('att_staff');
  const page = '/attendance/staff';
  const file = fd.get('file');
  const defOffice = s(fd, 'office');
  if (!file || typeof file === 'string' || !file.size) back(page, 'Choose an Excel file (.xlsx) first');
  if (file.size > 900000) back(page, 'That file is too large. Keep it under 900 KB.');

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  let ws = null;
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));
    ws = wb.worksheets[0] || null;
  } catch {
    ws = null;
  }
  if (!ws) back(page, 'That file could not be read. Save it as an Excel Workbook (.xlsx) and try again.');

  const txt = (v) => {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
      if (v.text != null) return String(v.text).trim();
      if (v.result != null) return String(v.result).trim();
      return '';
    }
    return String(v).trim();
  };
  const grid = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    grid.push(Array.from({ length: row.cellCount }, (_, i) => txt(row.getCell(i + 1).value)));
  });
  if (grid.length < 2) back(page, 'The sheet has no employee rows. Use the template: Name, Department, Office, Code.');

  const head = grid[0].map((h) => h.toLowerCase());
  const find = (names) => head.findIndex((h) => names.includes(h));
  const iName = find(['name', 'employee', 'employee name', 'full name']);
  const iDept = find(['department', 'dept', 'department name']);
  const iOffice = find(['office', 'location', 'branch']);
  const iCode = find(['code', 'code (optional)', 'employee code', 'emp code', 'id', 'employee id']);
  if (iName < 0) back(page, 'The first row must have a Name column. Download the template to see the layout.');
  const data = grid.slice(1);
  if (data.length > 500) back(page, 'Please upload at most 500 employees at a time.');

  const OFFICE = { lhr: 'LHR', lahore: 'LHR', isb: 'ISB', islamabad: 'ISB' };
  const offices = await q('SELECT id, code FROM pc2_offices');
  const officeId = Object.fromEntries(offices.map((o) => [o.code, o.id]));
  const have = await q('SELECT lower(name) AS n, office_id, code FROM pc2_staff');
  const seen = new Set(have.map((h) => h.office_id + '|' + h.n));
  const codes = new Set(have.map((h) => h.code));
  let next = 0;
  have.forEach((h) => {
    if (/^[0-9]+$/.test(h.code)) next = Math.max(next, Number(h.code));
  });

  const add = [];
  let dup = 0;
  let bad = 0;
  for (const r of data) {
    const name = (r[iName] || '').trim();
    if (!name) continue;
    const oc = iOffice >= 0 && r[iOffice] ? OFFICE[r[iOffice].toLowerCase()] : defOffice;
    const oid = officeId[oc];
    if (!oid) {
      bad += 1;
      continue;
    }
    const key = oid + '|' + name.toLowerCase();
    if (seen.has(key)) {
      dup += 1;
      continue;
    }
    let code = iCode >= 0 ? (r[iCode] || '').trim() : '';
    if (code && codes.has(code)) {
      dup += 1;
      continue;
    }
    if (!code) {
      do {
        next += 1;
        code = String(next).padStart(3, '0');
      } while (codes.has(code));
    }
    seen.add(key);
    codes.add(code);
    add.push([code, name, iDept >= 0 ? (r[iDept] || '').trim() : '', oid]);
  }

  if (add.length) {
    const vals = add.map((_, i) => '($' + (i * 4 + 1) + ',$' + (i * 4 + 2) + ',$' + (i * 4 + 3) + ',$' + (i * 4 + 4) + ')').join(',');
    await q('INSERT INTO pc2_staff (code, name, dept, office_id) VALUES ' + vals + ' ON CONFLICT (code) DO NOTHING', add.flat());
  }
  await logEvent(u, 'create', 'staff', null, 'Imported ' + add.length + ' employees from Excel (' + dup + ' already existed, ' + bad + ' skipped)', null, { imported: add.length, duplicates: dup, invalid: bad });
  back(page, 'Imported ' + add.length + ' employee(s)' + (dup ? ', ' + dup + ' already in the list' : '') + (bad ? ', ' + bad + ' row(s) without a valid office' : ''), add.length > 0);
}

// Change the type, date or time of an entry. Sr. OM: any entry. Sr. SO: entries made by the
// Support Officer, guards or themselves. Support Officers and guards: only their own entries.
// Everyone except the Sr. OM has 36 hours from when the entry was created.
export async function editEntry(fd) {
  const u = await need(ATT_ROLES);
  const id = Number(s(fd, 'id'));
  const to = PATHS.includes(s(fd, 'back')) ? s(fd, 'back') : '/attendance';
  const kind = s(fd, 'kind');
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!KIND_LABEL[kind]) back(to, 'Choose the type of entry');
  if (!validDate(date) || !validTime(time)) back(to, 'Choose a valid date and time');
  const r = (await q(
    `SELECT a.id, a.kind, a.entered_by, s.name, o.code AS office, ub.role AS by_role, to_char(a.at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at_txt, (a.entered_at > now() - interval '36 hours') AS open36
     FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id JOIN pc2_offices o ON o.id = a.office_id LEFT JOIN pc2_users ub ON ub.id = a.entered_by WHERE a.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!r) back(to, 'Entry not found');
  const mine = r.entered_by === u.id;
  const allowed = u.role === 'om' || (r.open36 && (u.role === 'sso' ? mine || ['so', 'guard'].includes(r.by_role) : mine));
  if (!allowed) back(to, r.open36 ? 'You can only change entries you made yourself' : 'This entry is older than 36 hours. Only the Sr. Ops Manager can change it.');
  const ms = Number((await q(
    `SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`,
    [date, time]
  ))[0].ms);
  if (ms > Date.now() + 60000) back(to, 'That time is in the future');
  await q(`UPDATE pc2_attendance SET kind = $1, at = ($2::date + $3::time) AT TIME ZONE 'Asia/Karachi' WHERE id = $4`, [kind, date, time, r.id]);
  await logEvent(u, 'edit', 'attendance', r.id,
    'Changed ' + r.name + ' (' + r.office + '): ' + KIND_LABEL[r.kind] + ' ' + r.at_txt + ' to ' + KIND_LABEL[kind] + ' ' + date + ' ' + time,
    { kind: r.kind, at: r.at_txt }, { kind, at: date + ' ' + time });
  back(to, 'Entry updated', true);
}
