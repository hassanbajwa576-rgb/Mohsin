'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { buildPlan, appEvents, classify, allEntries, explain, entriesOf } from './att-import';
import { scan, dayEntries } from './att-reconcile';
import { ATT_ROLES, KIND_LABEL, canSeeTimes, canEnterFor, firstBad, allEventsOf, validDate, validTime, closeStale, todayKey } from './att';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const PATHS = ['/attendance', '/attendance/logs', '/attendance/entries'];
const okBack = (b) => (PATHS.includes(b) || b.startsWith('/attendance/reconcile?') ? b : '/attendance');

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
  const to = okBack(s(fd, 'back'));
  const r = (await q(
    `SELECT a.id, a.entered_by, a.kind, ub.role AS by_role, s.name, o.code AS office, to_char(a.at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at_txt, (a.entered_at > now() - interval '36 hours') AS fresh
     FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id JOIN pc2_offices o ON o.id = a.office_id LEFT JOIN pc2_users ub ON ub.id = a.entered_by WHERE a.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!r) back(to, 'Entry not found');
  // Sr. OM: any entry. Sr. SO: own and the Support Officer's and guards'. Support Officer and guards: their own. 36 hours.
  const mineEntry = r.entered_by === u.id;
  const allowed = u.role === 'om' || can(u, 'att_reconcile') || (r.fresh && (u.role === 'sso' ? mineEntry || ['so', 'guard'].includes(r.by_role) : mineEntry));
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
  const to = okBack(s(fd, 'back'));
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
  const allowed = u.role === 'om' || can(u, 'att_reconcile') || (r.open36 && (u.role === 'sso' ? mine || ['so', 'guard'].includes(r.by_role) : mine));
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
  await needPerm('att_import');
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

async function insertEntries(uid, rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params = [uid];
    const vals = chunk.map((r) => {
      params.push(r[0], r[1], r[2], r[3], r[4]);
      const n = params.length;
      return `($${n - 4}, $${n - 3}, $${n - 2}, ($${n - 1}::date + $${n}::time) AT TIME ZONE 'Asia/Karachi', $1, 'excel')`;
    });
    await q(`INSERT INTO pc2_attendance (staff_id, office_id, kind, at, entered_by, source) VALUES ${vals.join(',')}`, params);
  }
}

// Step 2: add the entries. Times the app already has and that match are left alone, missing ones are added, and a day
// where the times differ is only changed when a choice was made for it.
export async function confirmImport(fd) {
  const u = await needPerm('att_import');
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
  const evs = await appEvents([...new Set(items.map((i) => Number(i.staff)))], from, to);
  const today = todayKey();
  const okT = (t) => typeof t === 'string' && validTime(t);

  const review = []; // days left as they were because the times differ
  const rows = []; // [staff, office, kind, date, time]
  const clear = []; // [staff, from, to (exclusive), only breaks]
  let days = 0;
  let skipped = 0;
  let replaced = 0;
  for (const raw of items) {
    const st = sm.get(Number(raw.staff));
    const date = String(raw.date || '');
    const hasIn = okT(raw.in);
    const hasOut = hasIn && okT(raw.out) && validDate(String(raw.outDate || ''));
    const it = {
      date,
      in: hasIn ? raw.in : '',
      out: hasOut ? raw.out : '',
      outDate: hasOut ? raw.outDate : date,
      breaks: (Array.isArray(raw.breaks) ? raw.breaks : []).filter((b) => Array.isArray(b) && okT(b[0]) && okT(b[1]) && b[1] > b[0]),
    };
    if (!st || !validDate(date) || date < from || date > to || date > today || (!hasIn && !it.breaks.length)) { skipped += 1; continue; }
    const r = classify(it, evs.get(st.id));
    if (!hasIn && !r.appIn) { skipped += 1; continue; }
    let add = r.adds;
    if (r.reasons.length) {
      if (s(fd, 'c:' + st.id + '|' + date) !== 'replace') {
        skipped += 1;
        const ex = explain(it, r);
        review.push([st.id, st.name, date, JSON.stringify({ staff: st.id, date, in: it.in, out: it.out, outDate: it.outDate, breaks: it.breaks }), ex.app, ex.excel, r.reasons.join('; ')]);
        continue;
      }
      clear.push([st.id, r.lo, r.hi, !hasIn]);
      replaced += 1;
      add = allEntries(it);
    }
    if (!add.length) continue;
    days += 1;
    for (const a of add) rows.push([st.id, st.office_id, a[0], a[1], a[2]]);
  }
  await saveReview(u, review, s(fd, 'notes'), from, to);
  if (!rows.length) back(page, 'Nothing needed adding' + (skipped ? ' (' + skipped + ' employee-days skipped)' : ''), true);

  const gone = [];
  for (const [id, lo, hi, breaksOnly] of clear) {
    const del = await q(
      `DELETE FROM pc2_attendance WHERE staff_id = $1 AND at >= ($2::timestamp AT TIME ZONE 'Asia/Karachi') AND at < ($3::timestamp AT TIME ZONE 'Asia/Karachi') ${breaksOnly ? "AND kind IN ('break_out', 'break_in')" : ''} RETURNING kind, to_char(at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS t`,
      [id, lo, hi]
    );
    gone.push(sm.get(id).name + ': ' + del.map((d) => d.kind + ' ' + d.t).join(', '));
  }
  await insertEntries(u.id, rows);
  await logEvent(u, 'create', 'attendance', null,
    'Imported ' + rows.length + ' entries from Excel for ' + days + ' employee-days (' + from + ' to ' + to + ')' + (replaced ? '; replaced the app entries of ' + replaced + ' days with the Excel times' : '') + (skipped ? '; ' + skipped + ' left as they were' : ''),
    gone.length ? { replaced: gone } : null, { entries: rows.length, days, from, to });
  const left = review.length ? ' ' + review.length + ' day' + (review.length > 1 ? 's' : '') + ' with different times stay on the review list.' : '';
  back(page, rows.length + ' entries added for ' + days + ' employee-days' + (skipped ? ' (' + skipped + ' left as they were)' : '') + '. They show underlined on Entries, Logs and Reports.' + left, true);
}

// What was left undone stays on a list until it is settled: days with different times, names that were not matched and skipped rows.
async function saveReview(u, review, notesJson, from, to) {
  for (const r of review) {
    await q(`UPDATE pc2_import_review SET resolved_at = now(), resolved_by = $3, resolution = 'replaced by a newer import' WHERE kind = 'conflict' AND resolved_at IS NULL AND staff_id = $1 AND day = $2`, [r[0], r[2], u.id]);
    await q(
      `INSERT INTO pc2_import_review (kind, staff_id, name, day, item, app_text, excel_text, reason, created_by) VALUES ('conflict', $1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [...r, u.id]
    );
  }
  let notes = {};
  try {
    notes = JSON.parse(notesJson || '{}');
  } catch {
    notes = {};
  }
  const names = (Array.isArray(notes.unmatched) ? notes.unmatched : []).slice(0, 100);
  for (const n of names) {
    const name = String(n.name || '').slice(0, 80);
    if (!name) continue;
    await q(`UPDATE pc2_import_review SET resolved_at = now(), resolved_by = $2, resolution = 'listed again' WHERE kind = 'unmatched' AND resolved_at IS NULL AND name = $1`, [name, u.id]);
    await q(`INSERT INTO pc2_import_review (kind, name, day, reason, created_by) VALUES ('unmatched', $1, $2, $3, $4)`, [name, from + ' to ' + to, String(n.why || 'not in the Employees list').slice(0, 120), u.id]);
  }
  for (const p of (Array.isArray(notes.problems) ? notes.problems : []).slice(0, 200)) {
    await q(`INSERT INTO pc2_import_review (kind, day, reason, created_by) VALUES ('skipped', $1, $2, $3)`, [from + ' to ' + to, String(p).slice(0, 200), u.id]);
  }
}

// Settle one item of the review list. 'excel' = use the Excel times, 'keep' = keep the app times, 'dismiss' = just remove it.
export async function resolveReview(fd) {
  const u = await needPerm('att_import');
  const page = '/attendance/import';
  const id = Number(s(fd, 'id'));
  const decision = s(fd, 'decision');
  const r = (await q('SELECT * FROM pc2_import_review WHERE id = $1 AND resolved_at IS NULL', [Number.isInteger(id) ? id : 0]))[0];
  if (!r) back(page, 'That item was already settled');
  let resolution = decision === 'keep' ? 'kept the app times' : 'dismissed';
  let msg = 'Done';
  if (r.kind === 'conflict' && decision === 'excel') {
    const it = r.item || {};
    const st = (await q('SELECT s.id, s.name, s.office_id FROM pc2_staff s WHERE s.id = $1 AND s.active', [Number(it.staff)]))[0];
    if (!st) back(page, 'That employee is no longer active');
    const okT = (t) => typeof t === 'string' && validTime(t);
    const hasIn = okT(it.in);
    const hasOut = hasIn && okT(it.out);
    const item = { date: it.date, in: hasIn ? it.in : '', out: hasOut ? it.out : '', outDate: hasOut ? it.outDate : it.date, breaks: Array.isArray(it.breaks) ? it.breaks : [] };
    const evs = await appEvents([st.id], item.date, item.date);
    const c = classify(item, evs.get(st.id));
    const del = await q(
      `DELETE FROM pc2_attendance WHERE staff_id = $1 AND at >= ($2::timestamp AT TIME ZONE 'Asia/Karachi') AND at < ($3::timestamp AT TIME ZONE 'Asia/Karachi') ${hasIn ? '' : "AND kind IN ('break_out', 'break_in')"} RETURNING kind, to_char(at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS t`,
      [st.id, c.lo, c.hi]
    );
    const rows = allEntries(item).map((a) => [st.id, st.office_id, a[0], a[1], a[2]]);
    if (rows.length) await insertEntries(u.id, rows);
    await logEvent(u, 'edit', 'attendance', null, 'Replaced the app entries of ' + st.name + ' on ' + item.date + ' with the Excel times (from the import review list)',
      { removed: del.map((d) => d.kind + ' ' + d.t) }, { entries: rows.length });
    resolution = 'used the Excel times';
    msg = st.name + ' ' + item.date + ': the Excel times are now in the app';
  } else if (r.kind === 'conflict' && decision !== 'keep') {
    back(page, 'Choose to use the Excel times or keep the app times');
  } else if (decision === 'keep') {
    msg = 'Kept the app times';
  } else {
    msg = 'Removed from the list';
  }
  await q('UPDATE pc2_import_review SET resolved_at = now(), resolved_by = $2, resolution = $3 WHERE id = $1', [r.id, u.id, resolution]);
  back(page, msg, true);
}

// Clear the names and skipped rows (the days with different times need an answer each).
export async function dismissNotes() {
  const u = await needPerm('att_import');
  await q(`UPDATE pc2_import_review SET resolved_at = now(), resolved_by = $1, resolution = 'dismissed' WHERE resolved_at IS NULL AND kind IN ('unmatched', 'skipped')`, [u.id]);
  back('/attendance/import', 'Names and skipped rows cleared', true);
}

// Correct the app's times of one day from the import preview, without leaving the page. Only the time of an existing
// entry changes (never its date), and only entries of that employee and day can be touched.
export async function saveAppTimes(payload) {
  const u = await needPerm('att_import');
  const raw = (payload && payload.item) || {};
  const staffId = Number(raw.staff);
  const date = String(raw.date || '');
  if (!Number.isInteger(staffId) || !validDate(date)) return { error: 'That day could not be found' };
  const okT = (t) => typeof t === 'string' && validTime(t);
  const hasIn = okT(raw.in);
  const hasOut = hasIn && okT(raw.out) && validDate(String(raw.outDate || ''));
  const item = {
    date,
    in: hasIn ? raw.in : '',
    out: hasOut ? raw.out : '',
    outDate: hasOut ? raw.outDate : date,
    breaks: (Array.isArray(raw.breaks) ? raw.breaks : []).filter((b) => Array.isArray(b) && okT(b[0]) && okT(b[1]) && b[1] > b[0]),
  };
  const st = (await q('SELECT id, name FROM pc2_staff WHERE id = $1', [staffId]))[0];
  if (!st) return { error: 'That employee could not be found' };

  const before = await appEvents([staffId], date, date);
  const c0 = classify(item, before.get(staffId));
  const allowed = new Map(c0.win.map((e) => [e.id, e]));
  const changes = (Array.isArray(payload.changes) ? payload.changes : [])
    .map((x) => ({ id: Number(x.id), t: String(x.t || '') }))
    .filter((x) => allowed.has(x.id) && okT(x.t) && allowed.get(x.id).t !== x.t);
  if (!changes.length) return { error: 'Change a time first' };

  const was = [];
  for (const ch of changes) {
    const e = allowed.get(ch.id);
    await q(`UPDATE pc2_attendance SET at = ($1::date + $2::time) AT TIME ZONE 'Asia/Karachi' WHERE id = $3 AND staff_id = $4`, [e.d, ch.t, ch.id, staffId]);
    was.push(KIND_LABEL[e.kind] + ' ' + e.d + ' ' + e.t + ' to ' + ch.t);
  }
  await logEvent(u, 'edit', 'attendance', null, 'Changed ' + st.name + ' (import review): ' + was.join('; '), { entries: was }, { changed: changes.length });

  const after = await appEvents([staffId], date, date);
  const c = classify(item, after.get(staffId));
  const ex = explain(item, c);
  return { ok: true, app: ex.app, reasons: c.reasons, matches: c.reasons.length === 0, entries: entriesOf(c.win) };
}

/* ---------- reconciliation: items marked as reviewed do not come up again ---------- */

const MARK_KINDS = ['long', 'noout', 'misfit'];

async function saveMarks(u, list) {
  let n = 0;
  for (const m of list.slice(0, 400)) {
    const staff = Number(m && m.staff);
    const day = String((m && m.day) || '');
    const kind = String((m && m.kind) || '');
    const sig = String((m && m.sig) || '').slice(0, 300);
    if (!Number.isInteger(staff) || !validDate(day) || !MARK_KINDS.includes(kind) || !sig) continue;
    await q('INSERT INTO pc2_review_marks (staff_id, day, kind, sig, marked_by) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [staff, day, kind, sig, u.id]);
    n += 1;
  }
  return n;
}

// From the import preview (no page change).
export async function markReviewed(payload) {
  const u = await needPerm('att_reconcile');
  const n = await saveMarks(u, [payload || {}]);
  return n ? { ok: true } : { error: 'Could not mark that as reviewed' };
}

// From the reconciliation page: one item, or every item shown in a list.
export async function markReviewedForm(fd) {
  const u = await needPerm('att_reconcile');
  let list = [];
  try {
    list = JSON.parse(s(fd, 'items'));
  } catch {
    list = [];
  }
  const n = await saveMarks(u, Array.isArray(list) ? list : []);
  if (n) await logEvent(u, 'edit', 'attendance', null, 'Marked ' + n + ' attendance item' + (n > 1 ? 's' : '') + ' as reviewed (reconciliation)', null, { items: n });
  const back_ = s(fd, 'back');
  back(back_.startsWith('/attendance/reconcile') ? back_ : '/attendance/reconcile', n ? n + ' marked as reviewed' : 'Nothing to mark', !!n);
}

// Change or delete one entry from the reconciliation list without leaving the page. Returns that day's fresh entries and
// whether the day is still flagged, so the list can update itself.
export async function fixEntry(payload) {
  const u = await needPerm('att_reconcile');
  const id = Number((payload && payload.id) || 0);
  const day = String((payload && payload.day) || '');
  const e = (await q(
    `SELECT a.id, a.staff_id, a.kind, s.name, to_char(a.at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at_txt FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id WHERE a.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!e || !validDate(day)) return { error: 'That entry no longer exists' };

  if (payload.remove) {
    await q('DELETE FROM pc2_attendance WHERE id = $1', [e.id]);
    await logEvent(u, 'delete', 'attendance', e.id, 'Removed ' + KIND_LABEL[e.kind] + ' - ' + e.name + ' ' + e.at_txt + ' (reconciliation)', { kind: e.kind, at: e.at_txt }, null);
  } else {
    const kind = String(payload.kind || '');
    const date = String(payload.date || '');
    const time = String(payload.time || '');
    if (!KIND_LABEL[kind]) return { error: 'Choose the type of entry' };
    if (!validDate(date) || !validTime(time)) return { error: 'Choose a valid date and time' };
    const ms = Number((await q(`SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`, [date, time]))[0].ms);
    if (ms > Date.now() + 60000) return { error: 'That time is in the future' };
    await q(`UPDATE pc2_attendance SET kind = $1, at = ($2::date + $3::time) AT TIME ZONE 'Asia/Karachi' WHERE id = $4`, [kind, date, time, e.id]);
    await logEvent(u, 'edit', 'attendance', e.id, 'Changed ' + e.name + ' (reconciliation): ' + KIND_LABEL[e.kind] + ' ' + e.at_txt + ' to ' + KIND_LABEL[kind] + ' ' + date + ' ' + time,
      { kind: e.kind, at: e.at_txt }, { kind, at: date + ' ' + time });
  }
  const left = await scan(day, day, e.staff_id);
  return {
    ok: true,
    entries: await dayEntries(e.staff_id, day),
    flagged: { long: left.long.length > 0, noout: left.noout.length > 0, misfit: left.misfit.length > 0 },
  };
}

// Mark several items reviewed from the list without leaving the page.
export async function markReviewedMany(items) {
  const u = await needPerm('att_reconcile');
  const n = await saveMarks(u, Array.isArray(items) ? items : []);
  if (n) await logEvent(u, 'edit', 'attendance', null, 'Marked ' + n + ' attendance item' + (n > 1 ? 's' : '') + ' as reviewed (reconciliation)', null, { items: n });
  return n ? { ok: true, n } : { error: 'Nothing to mark' };
}

// Fix one employee-day from the reconciliation popup in one go: change entries, add missing ones, delete wrong ones.
export async function saveDay(payload) {
  const u = await needPerm('att_reconcile');
  const staffId = Number(payload && payload.staff);
  const day = String((payload && payload.day) || '');
  if (!Number.isInteger(staffId) || !validDate(day)) return { error: 'That day could not be found' };
  const st = (await q('SELECT id, name, office_id FROM pc2_staff WHERE id = $1', [staffId]))[0];
  if (!st) return { error: 'That employee could not be found' };
  const next = new Date(day + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const dayNext = next.toISOString().slice(0, 10);
  const inRange = (d) => d === day || d === dayNext;

  const mine = await q(
    `SELECT a.id, a.kind, a.office_id, to_char(a.at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at_txt FROM pc2_attendance a WHERE a.staff_id = $1 AND a.at >= (($2::date)::timestamp AT TIME ZONE 'Asia/Karachi') AND a.at < (($2::date + 2)::timestamp AT TIME ZONE 'Asia/Karachi')`,
    [staffId, day]
  );
  const have = new Map(mine.map((e) => [e.id, e]));
  const office = (mine[0] && mine[0].office_id) || st.office_id;
  const when = (d, t) => d + ' ' + t;
  const future = async (d, t) => Number((await q(`SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`, [d, t]))[0].ms) > Date.now() + 60000;

  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const adds = Array.isArray(payload.adds) ? payload.adds : [];
  const removes = (Array.isArray(payload.removes) ? payload.removes : []).map(Number);
  for (const c of [...changes, ...adds]) {
    if (!KIND_LABEL[c.kind] || !validDate(String(c.date || '')) || !validTime(String(c.time || '')) || !inRange(c.date)) return { error: 'Check the type, date and time of each line' };
    if (await future(c.date, c.time)) return { error: 'A time is in the future' };
  }
  for (const c of changes) if (!have.has(Number(c.id))) return { error: 'An entry no longer exists. Close this and open it again.' };
  for (const id of removes) if (!have.has(id)) return { error: 'An entry no longer exists. Close this and open it again.' };

  const notes = [];
  for (const c of changes) {
    const e = have.get(Number(c.id));
    await q(`UPDATE pc2_attendance SET kind = $1, at = ($2::date + $3::time) AT TIME ZONE 'Asia/Karachi' WHERE id = $4`, [c.kind, c.date, c.time, e.id]);
    notes.push('changed ' + KIND_LABEL[e.kind] + ' ' + e.at_txt + ' to ' + KIND_LABEL[c.kind] + ' ' + when(c.date, c.time));
  }
  for (const id of removes) {
    const e = have.get(id);
    await q('DELETE FROM pc2_attendance WHERE id = $1', [id]);
    notes.push('deleted ' + KIND_LABEL[e.kind] + ' ' + e.at_txt);
  }
  for (const c of adds) {
    await q(`INSERT INTO pc2_attendance (staff_id, office_id, kind, at, entered_by) VALUES ($1, $2, $3, ($4::date + $5::time) AT TIME ZONE 'Asia/Karachi', $6)`, [staffId, office, c.kind, c.date, c.time, u.id]);
    notes.push('added ' + KIND_LABEL[c.kind] + ' ' + when(c.date, c.time));
  }
  if (!notes.length) return { error: 'Nothing was changed' };
  await logEvent(u, 'edit', 'attendance', null, st.name + ' ' + day + ' (reconciliation): ' + notes.join('; '), null, { changes: changes.length, added: adds.length, deleted: removes.length });
  return { ok: true, entries: await dayEntries(staffId, day) };
}
