'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { buildPlan, existingDays } from './att-import';
import { ATT_ROLES, KIND_LABEL, canSeeTimes, canEnterFor, firstBad, allEventsOf, validDate, validTime, closeStale, todayKey } from './att';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const PATHS = ['/attendance', '/attendance/logs', '/attendance/entries'];

// Ops is called Operations everywhere.
const normDept = (d) => (/^ops$/i.test(String(d).trim()) ? 'Operations' : String(d).trim());

// Shift fields from the employee form: { shift, start, end } or { err }.
function shiftFrom(fd) {
  const shift = s(fd, 'shift');
  if (!shift) return { shift: '', start: '', end: '' };
  if (!['morning', 'evening', 'night'].includes(shift)) return { err: 'Pick a valid shift' };
  const start = s(fd, 'shift_start');
  const end = s(fd, 'shift_end');
  if (!validTime(start) || !validTime(end)) return { err: 'Enter the shift start and end times' };
  return { shift, start, end };
}


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
  // The entry is recorded (and counted) at the office where the person is working. An employee from the other
  // office who is visiting can be entered by someone at that office; they stay on their own office's staff list.
  const at = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'at_office') || st.office]))[0];
  if (!at) back('/attendance', 'Choose the office');
  if (!canEnterFor(u, at.id)) back('/attendance', 'You can only record entries at your own office');

  const ms = Number((await q(
    `SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`,
    [date, time]
  ))[0].ms);
  if (ms > Date.now() + 60000) back('/attendance', 'That time is in the future');

  // Any of the four entry types can be recorded in any order. Entries that do not fit together are shown
  // in red on the Entries and Logs pages so they can be fixed.
  const ins = await q(
    `INSERT INTO pc2_attendance (staff_id, office_id, kind, at, entered_by) VALUES ($1, $2, $3, ($4::date + $5::time) AT TIME ZONE 'Asia/Karachi', $6) RETURNING id`,
    [st.id, at.id, kind, date, time, u.id]
  );
  const visit = at.code !== st.office ? ', visiting ' + at.code : '';
  await logEvent(u, 'create', 'attendance', ins[0].id, KIND_LABEL[kind] + ' - ' + st.name + ' (' + st.office + visit + ') on ' + date + ' at ' + time, null,
    { staff: st.name, office: at.code, kind, date, time });
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
  // Sr. OM: any entry. Sr. SO: own and the Support Officer's and guards'. Support Officer and guards: their own. 36 hours.
  const mineEntry = r.entered_by === u.id;
  const allowed = u.role === 'om' || (r.fresh && (u.role === 'sso' ? mineEntry || ['so', 'guard'].includes(r.by_role) : mineEntry));
  if (!allowed) back(to, 'You can delete entries you made yourself within 36 hours (the Sr. Support Officer also those of the Support Officer and guards)');
  await q('DELETE FROM pc2_attendance WHERE id = $1', [r.id]);
  await logEvent(u, 'delete', 'attendance', r.id, 'Removed ' + KIND_LABEL[r.kind] + ' - ' + r.name + ' (' + r.office + ') ' + r.at_txt, { staff: r.name, kind: r.kind, at: r.at_txt }, null);
  back(to, 'Entry removed', true);
}

/* ---------- employees (Sr. Ops Manager only) ---------- */

export async function addStaff(fd) {
  const u = await needPerm('att_staff');
  const name = s(fd, 'name');
  let code = s(fd, 'code');
  const dept = normDept(s(fd, 'dept'));
  const sh = shiftFrom(fd);
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (!name) back('/attendance/staff', 'Enter the employee name');
  if (sh.err) back('/attendance/staff', sh.err);
  if (!code) {
    // No code given: use the next free number (001, 002, ...)
    const nx = await q(`SELECT COALESCE(MAX(CASE WHEN code ~ '^[0-9]+$' THEN code::int END), 0) + 1 AS n FROM pc2_staff`);
    code = String(nx[0].n).padStart(3, '0');
  }
  if (!off) back('/attendance/staff', 'Pick an office');
  let failed = false;
  let id = null;
  try {
    id = (await q('INSERT INTO pc2_staff (code, name, dept, office_id, shift, shift_start, shift_end) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [code, name, dept, off.id, sh.shift, sh.start, sh.end]))[0].id;
  } catch {
    failed = true;
  }
  if (failed) back('/attendance/staff', 'That employee code is already in use');
  await logEvent(u, 'create', 'staff', id, 'Added employee ' + name + ' #' + code + ' (' + off.code + ')', null, { name, code, dept, office: off.code, shift: sh.shift, shift_start: sh.start, shift_end: sh.end });
  back('/attendance/staff', 'Employee added', true);
}

export async function updateStaff(fd) {
  const u = await needPerm('att_staff');
  const id = Number(s(fd, 'id'));
  const name = s(fd, 'name');
  let code = s(fd, 'code');
  const dept = normDept(s(fd, 'dept'));
  const sh = shiftFrom(fd);
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [s(fd, 'office')]))[0];
  if (sh.err) back('/attendance/staff/edit?id=' + id, sh.err);
  if (!code) {
    const cur = (await q('SELECT code FROM pc2_staff WHERE id = $1', [id]))[0];
    code = cur ? cur.code : '';
  }
  if (!name || !code || !off) back('/attendance/staff', 'Enter the name and office');
  let failed = false;
  try {
    await q('UPDATE pc2_staff SET name = $1, code = $2, dept = $3, office_id = $4, shift = $5, shift_start = $6, shift_end = $7 WHERE id = $8', [name, code, dept, off.id, sh.shift, sh.start, sh.end, id]);
  } catch {
    failed = true;
  }
  if (failed) back('/attendance/staff', 'That employee code is already in use');
  await logEvent(u, 'edit', 'staff', id, 'Edited employee ' + name + ' #' + code + ' (' + off.code + ')', null, { name, code, dept, office: off.code, shift: sh.shift, shift_start: sh.start, shift_end: sh.end });
  back('/attendance/staff', 'Employee updated', true);
}

// One shift for one or more departments; employees without a shift of their own follow it. "No shift" removes it.
export async function saveDeptShift(fd) {
  const u = await needPerm('att_staff');
  const depts = [...new Set(fd.getAll('dept').map((x) => normDept(String(x))).filter(Boolean))];
  const sh = shiftFrom(fd);
  if (!depts.length) back('/attendance/staff', 'Tick at least one department');
  if (sh.err) back('/attendance/staff', sh.err);
  const known = (await q('SELECT DISTINCT dept FROM pc2_staff WHERE dept = ANY($1::text[])', [depts])).map((r) => r.dept);
  const missing = depts.filter((d) => !known.includes(d));
  if (missing.length) back('/attendance/staff', 'No employees yet in: ' + missing.join(', '));
  const names = depts.join(', ');
  if (!sh.shift) {
    await q('DELETE FROM pc2_dept_shifts WHERE dept = ANY($1::text[])', [depts]);
    await logEvent(u, 'update', 'staff', null, 'Removed the shift for: ' + names);
    back('/attendance/staff', 'Shift removed for ' + names, true);
  }
  for (const dept of depts) {
    await q(
      'INSERT INTO pc2_dept_shifts (dept, shift, shift_start, shift_end) VALUES ($1,$2,$3,$4) ON CONFLICT (dept) DO UPDATE SET shift = EXCLUDED.shift, shift_start = EXCLUDED.shift_start, shift_end = EXCLUDED.shift_end, updated_at = now()',
      [dept, sh.shift, sh.start, sh.end]
    );
  }
  await logEvent(u, 'update', 'staff', null, 'Set the ' + sh.shift + ' shift ' + sh.start + ' - ' + sh.end + ' for: ' + names, null, { depts, shift: sh.shift, shift_start: sh.start, shift_end: sh.end });
  back('/attendance/staff', 'Shift saved for ' + names, true);
}
// Temporary hours: different start and end times for a date range, for departments, employees or everyone.
// They end by themselves after the last date, and everyone is back on their normal shift.
export async function saveTempHours(fd) {
  const u = await needPerm('att_staff');
  const page = '/attendance/staff';
  const scope = s(fd, 'scope');
  const from = s(fd, 'from_date');
  const to = s(fd, 'to_date');
  const start = s(fd, 'shift_start');
  const end = s(fd, 'shift_end');
  const note = s(fd, 'note').slice(0, 80);
  if (!['everyone', 'department', 'employee'].includes(scope)) back(page, 'Choose who the temporary hours apply to');
  if (!validDate(from) || !validDate(to) || from > to) back(page, 'Enter a valid date range (the last date cannot be before the first)');
  if (!validTime(start) || !validTime(end)) back(page, 'Enter the start and end times');
  let targets = [];
  if (scope === 'everyone') targets = [{ scope, dept: '', staff: null, label: 'Everyone' }];
  if (scope === 'department') {
    const depts = [...new Set(fd.getAll('dept').map((x) => String(x).trim()).filter(Boolean))];
    if (!depts.length) back(page, 'Tick at least one department');
    const known = (await q('SELECT DISTINCT dept FROM pc2_staff WHERE dept = ANY($1::text[])', [depts])).map((r) => r.dept);
    if (known.length !== depts.length) back(page, 'Some of those departments have no employees');
    targets = depts.map((d) => ({ scope, dept: d, staff: null, label: d }));
  }
  if (scope === 'employee') {
    const ids = [...new Set(fd.getAll('staff').map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))];
    if (!ids.length) back(page, 'Tick at least one employee');
    const found = await q('SELECT id, name FROM pc2_staff WHERE id = ANY($1::int[])', [ids]);
    if (found.length !== ids.length) back(page, 'Some of those employees were not found');
    targets = found.map((r) => ({ scope, dept: '', staff: r.id, label: r.name }));
  }
  for (const t of targets) {
    await q(
      'INSERT INTO pc2_shift_periods (scope, dept, staff_id, shift_start, shift_end, from_date, to_date, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [t.scope, t.dept, t.staff, start, end, from, to, note, u.id]
    );
  }
  const names = targets.map((t) => t.label).join(', ');
  await logEvent(u, 'create', 'staff', null, 'Temporary hours ' + start + ' - ' + end + ' from ' + from + ' to ' + to + ' for: ' + names + (note ? ' (' + note + ')' : ''), null, { scope, from, to, start, end, note, targets: names });
  back(page, 'Temporary hours saved for ' + names + '. They end on ' + to + ' and everyone goes back to their normal shift.', true);
}

// End a temporary period today (or remove it when it has not started yet).
export async function endTempHours(fd) {
  const u = await needPerm('att_staff');
  const id = Number(s(fd, 'id'));
  const r = (await q("SELECT id, to_char(from_date, 'YYYY-MM-DD') AS from_date, to_char(to_date, 'YYYY-MM-DD') AS to_date FROM pc2_shift_periods WHERE id = $1", [Number.isInteger(id) ? id : 0]))[0];
  if (!r) back('/attendance/staff', 'That period was not found');
  const today = todayKey();
  if (r.from_date > today) await q('DELETE FROM pc2_shift_periods WHERE id = $1', [id]);
  else if (r.to_date > today) await q('UPDATE pc2_shift_periods SET to_date = $2 WHERE id = $1', [id, today]);
  await logEvent(u, 'update', 'staff', id, 'Ended temporary hours #' + id + ' on ' + today);
  back('/attendance/staff', 'Temporary hours ended. Normal shifts apply again from tomorrow.', true);
}

export async function deleteTempHours(fd) {
  const u = await needPerm('att_staff');
  const id = Number(s(fd, 'id'));
  await q('DELETE FROM pc2_shift_periods WHERE id = $1', [Number.isInteger(id) ? id : 0]);
  await logEvent(u, 'delete', 'staff', id, 'Removed temporary hours #' + id);
  back('/attendance/staff', 'Temporary hours removed', true);
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
    add.push([code, name, iDept >= 0 ? normDept(r[iDept] || '') : '', oid]);
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

// Remove an employee for good, together with their attendance entries. Sr. Ops Manager only.
export async function deleteStaff(fd) {
  const u = await need(['om']);
  const id = Number(s(fd, 'id'));
  const r = (await q(
    'SELECT s.name, o.code AS office, (SELECT COUNT(*)::int FROM pc2_attendance a WHERE a.staff_id = s.id) AS n FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.id = $1',
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!r) back('/attendance/staff', 'Employee not found');
  await q('DELETE FROM pc2_attendance WHERE staff_id = $1', [id]);
  await q('DELETE FROM pc2_staff WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'staff', id, 'Deleted employee ' + r.name + ' (' + r.office + ') and ' + r.n + ' attendance entries', { name: r.name, office: r.office, entries: r.n }, null);
  back('/attendance/staff', r.name + ' deleted', true);
}

/* ---------- import from the weekly Excel sheets (Sr. Ops Manager only) ---------- */

const MAX_FILE = 3000000;
const fileOf = (fd, k) => {
  const f = fd.get(k);
  return f && typeof f !== 'string' && f.size ? f : null;
};

// Step 1: read the file(s) and show what would happen. Nothing is saved.
export async function previewImport(prev, fd) {
  await need(['om']);
  const from = s(fd, 'from');
  const to = s(fd, 'to');
  const attFile = fileOf(fd, 'att');
  const brkFile = fileOf(fd, 'brk');
  if (!attFile && !brkFile) return { error: 'Choose the attendance file, the break file, or both' };
  if (!validDate(from) || !validDate(to) || from > to) return { error: 'Choose a valid From and To date' };
  if (to > todayKey()) return { error: 'The To date cannot be in the future' };
  if ((new Date(to) - new Date(from)) / 864e5 > 62) return { error: 'Import at most two months at a time' };
  for (const f of [attFile, brkFile]) if (f && f.size > MAX_FILE) return { error: 'A file is larger than 3 MB. Save a copy with only the months you need.' };
  try {
    const plan = await buildPlan({ attFile, brkFile, from, to });
    return { plan };
  } catch (e) {
    return { error: 'That file could not be read. Save it as an Excel Workbook (.xlsx) and try again.' };
  }
}

// Step 2: add the entries. Days that already have entries in the app are only touched when a choice was made.
export async function confirmImport(fd) {
  const u = await need(['om']);
  const page = '/attendance/import';
  let items = [];
  try {
    items = JSON.parse(s(fd, 'payload'));
  } catch {
    back(page, 'The preview expired. Upload the file again.');
  }
  const from = s(fd, 'from');
  const to = s(fd, 'to');
  if (!Array.isArray(items) || !items.length || !validDate(from) || !validDate(to)) back(page, 'Nothing to import');

  const staff = await q('SELECT s.id, s.name, s.office_id FROM pc2_staff s WHERE s.active');
  const sm = new Map(staff.map((x) => [x.id, x]));
  const exist = await existingDays([...new Set(items.map((i) => Number(i.staff)))], from, to);
  const today = todayKey();

  const rows = []; // [staff, office, kind, date, time]
  const clear = []; // [staff, date]
  let added = 0;
  let skipped = 0;
  let replaced = 0;
  for (const it of items) {
    const st = sm.get(Number(it.staff));
    const date = String(it.date || '');
    if (!st || !validDate(date) || date < from || date > to || date > today) { skipped += 1; continue; }
    const hasIn = validTime(it.in) && validTime(it.out) && validDate(it.outDate);
    const brk = (Array.isArray(it.breaks) ? it.breaks : []).filter((b) => Array.isArray(b) && validTime(b[0]) && validTime(b[1]) && b[1] > b[0]);
    if (!hasIn && !brk.length) { skipped += 1; continue; }
    const key = st.id + '|' + date;
    if (exist.has(key)) {
      const c = s(fd, 'c:' + key);
      if (c === 'replace' && hasIn) { clear.push([st.id, date]); replaced += 1; }
      else if (c !== 'add' && !(c === 'replace' && !hasIn)) { skipped += 1; continue; }
    }
    if (hasIn) rows.push([st.id, st.office_id, 'in', date, it.in]);
    // On a night shift, a break before the check in time happens after midnight, on the next date.
    for (const b of brk) {
      const bd = hasIn && it.outDate > date && b[0] < it.in ? it.outDate : date;
      rows.push([st.id, st.office_id, 'break_out', bd, b[0]], [st.id, st.office_id, 'break_in', bd, b[1]]);
    }
    if (hasIn) rows.push([st.id, st.office_id, 'out', it.outDate, it.out]);
    added += 1;
  }
  if (!rows.length) back(page, 'Nothing was added (' + skipped + ' employee-days skipped)');

  const gone = [];
  for (const [id, date] of clear) {
    const del = await q(
      `DELETE FROM pc2_attendance WHERE staff_id = $1 AND at >= (($2::date)::timestamp AT TIME ZONE 'Asia/Karachi') AND at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Karachi') RETURNING kind, to_char(at AT TIME ZONE 'Asia/Karachi', 'HH24:MI') AS t`,
      [id, date]
    );
    gone.push(sm.get(id).name + ' ' + date + ': ' + del.map((d) => d.kind + ' ' + d.t).join(', '));
  }
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params = [u.id];
    const vals = chunk.map((r) => {
      params.push(r[0], r[1], r[2], r[3], r[4]);
      const n = params.length;
      return `($${n - 4}, $${n - 3}, $${n - 2}, ($${n - 1}::date + $${n}::time) AT TIME ZONE 'Asia/Karachi', $1, 'excel')`;
    });
    await q(`INSERT INTO pc2_attendance (staff_id, office_id, kind, at, entered_by, source) VALUES ${vals.join(',')}`, params);
  }
  await logEvent(u, 'create', 'attendance', null,
    'Imported ' + rows.length + ' entries from Excel for ' + added + ' employee-days (' + from + ' to ' + to + ')' + (replaced ? '; replaced the existing entries of ' + replaced + ' days' : '') + (skipped ? '; ' + skipped + ' skipped' : ''),
    gone.length ? { replaced: gone } : null, { entries: rows.length, days: added, from, to });
  back(page, rows.length + ' entries added for ' + added + ' employee-days' + (skipped ? ' (' + skipped + ' skipped)' : '') + '. They show underlined on Entries, Logs and Reports.', true);
}
