import 'server-only';
import { q } from './db';
import { TZ, validDate, validTime } from './att';

// Reads the weekly Excel sheets (one sheet per month, one row per employee, three columns per day) and works out
// what would be added. Nothing is saved here.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const addDay = (key, n) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function val(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (v.richText) v = v.richText.map((t) => t.text).join('');
    else v = v.result !== undefined ? v.result : null;
  }
  return v === undefined ? null : v;
}

// A cell holding a time of day (a time, a fraction of a day or text such as 10:55) as HH:MM, or null.
function timeOf(v) {
  if (v == null || v === '') return null;
  let m = null;
  if (v instanceof Date) m = Math.round((((v.getTime() % 864e5) + 864e5) % 864e5) / 60000);
  else if (typeof v === 'number') m = Math.round((v % 1) * 1440);
  else {
    const t = String(v).trim().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
    if (!t) return null;
    let h = Number(t[1]);
    if (t[3]) h = (h % 12) + (/pm/i.test(t[3]) ? 12 : 0);
    m = h * 60 + Number(t[2]);
  }
  m %= 1440;
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}

function sheetFor(wb, year, month) {
  for (const ws of wb.worksheets) {
    const m = String(ws.name).trim().match(/^([a-z]{3})[a-z]*[\s-]*'?(\d{2,4})$/i);
    if (!m) continue;
    const yy = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2]);
    if (MONTHS.indexOf(m[1].toLowerCase()) === month - 1 && yy === year) return ws;
  }
  return null;
}

// Rows of one monthly sheet inside the date range. Attendance: one record per employee and day with in / out.
// Breaks: one record per employee, day and break number with out / in (an employee has one row per break).
function readSheet(ws, year, month, from, to, mode, problems) {
  const cols = {};
  for (let c = 5; c <= ws.columnCount; c++) {
    const day = Number(val(ws.getRow(1).getCell(c)));
    const lab = String(val(ws.getRow(3).getCell(c)) || '').trim().toLowerCase();
    if (!(day >= 1 && day <= 31) || (lab !== 'check in' && lab !== 'check out')) continue;
    const date = year + '-' + pad(month) + '-' + pad(day);
    if (date < from || date > to || !validDate(date)) continue;
    if (!cols[date]) cols[date] = {};
    if (cols[date][lab] == null) cols[date][lab] = c;
  }
  const out = [];
  const seen = new Map();
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = String(val(row.getCell(2)) || '').trim();
    if (!name || /^(total|average|avg)/i.test(name)) continue;
    const k = norm(name);
    const idx = seen.get(k) || 0;
    seen.set(k, idx + 1);
    for (const [date, c] of Object.entries(cols)) {
      const a = c['check in'] != null ? timeOf(val(row.getCell(c['check in']))) : null;
      const b = c['check out'] != null ? timeOf(val(row.getCell(c['check out']))) : null;
      if (a == null && b == null) continue;
      if (mode === 'attendance') {
        if (idx > 0) {
          problems.push(name + ' has more than one row on the attendance sheet (' + date + ' ignored)');
          continue;
        }
        out.push({ name, date, in: a, out: b });
      } else {
        // On the break sheet "Check Out" is the start of the break and "Check In" the end.
        out.push({ name, date, n: idx, from: b, to: a });
      }
    }
  }
  return out;
}

async function load(file) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));
  return wb;
}

async function readFile(file, from, to, mode, problems) {
  const wb = await load(file);
  const out = [];
  const months = new Set();
  for (let d = from; d <= to; d = addDay(d, 1)) months.add(d.slice(0, 7));
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    const ws = sheetFor(wb, y, m);
    if (!ws) {
      problems.push('No sheet for ' + MONTHS[m - 1].toUpperCase() + ' ' + y + ' in the ' + (mode === 'attendance' ? 'attendance' : 'break') + ' file');
      continue;
    }
    out.push(...readSheet(ws, y, m, from, to, mode, problems));
  }
  return out;
}

const kindText = (k) => ({ in: 'In', out: 'Out' }[k] || k);
export const describe = (it) =>
  [
    it.in ? 'In ' + it.in : '',
    it.out ? 'Out ' + it.out : '',
    it.breaks && it.breaks.length ? it.breaks.length + ' break' + (it.breaks.length > 1 ? 's' : '') : '',
  ].filter(Boolean).join(' - ') || 'nothing';

/** Existing entries of the given people in the range, grouped by employee and day: { 'id|date': 'In 10:03 - Out 18:40 - 1 break' }. */
export async function existingDays(staffIds, from, to) {
  if (!staffIds.length) return new Map();
  const rows = await q(
    `SELECT a.staff_id, a.kind, to_char(a.at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS d, to_char(a.at AT TIME ZONE '${TZ}', 'HH24:MI') AS t
     FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($3::date + 1)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [staffIds, from, to]
  );
  const m = new Map();
  for (const r of rows) {
    const k = r.staff_id + '|' + r.d;
    if (!m.has(k)) m.set(k, { in: '', out: '', breaks: 0 });
    const x = m.get(k);
    if (r.kind === 'in' && !x.in) x.in = r.t;
    if (r.kind === 'out') x.out = r.t;
    if (r.kind === 'break_out') x.breaks += 1;
  }
  const text = new Map();
  for (const [k, x] of m) text.set(k, describe({ in: x.in, out: x.out, breaks: new Array(x.breaks) }));
  return text;
}

/** Read the uploaded file(s) and return everything the preview needs. */
export async function buildPlan({ attFile, brkFile, from, to }) {
  const problems = [];
  const att = attFile ? await readFile(attFile, from, to, 'attendance', problems) : [];
  const brk = brkFile ? await readFile(brkFile, from, to, 'break', problems) : [];

  const staff = await q('SELECT s.id, s.name, s.office_id, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.active');
  const byName = new Map();
  for (const s of staff) {
    const k = norm(s.name);
    byName.set(k, byName.has(k) ? 'dup' : s);
  }
  const unmatched = new Map();
  const find = (name) => {
    const s = byName.get(norm(name));
    if (!s || s === 'dup') {
      const u = unmatched.get(name) || { name, n: 0, why: s === 'dup' ? 'two employees have this name' : 'not in the Employees list' };
      u.n += 1;
      unmatched.set(name, u);
      return null;
    }
    return s;
  };

  const items = new Map();
  const get = (s, date) => {
    const k = s.id + '|' + date;
    if (!items.has(k)) items.set(k, { key: k, staff: s.id, name: s.name, office: s.office, date, in: '', out: '', outDate: date, breaks: [], breaksOnly: true });
    return items.get(k);
  };
  for (const r of att) {
    const s = find(r.name);
    if (!s) continue;
    if (r.in == null || r.out == null) {
      problems.push(s.name + ' ' + r.date + ': only ' + (r.in ? 'a check in (' + r.in + ')' : 'a check out (' + r.out + ')') + ' on the sheet, skipped');
      continue;
    }
    if (r.in === r.out) {
      problems.push(s.name + ' ' + r.date + ': check in and check out are the same time, skipped');
      continue;
    }
    const it = get(s, r.date);
    it.in = r.in;
    it.out = r.out;
    it.outDate = r.out < r.in ? addDay(r.date, 1) : r.date;
    it.breaksOnly = false;
  }
  for (const r of brk) {
    const s = find(r.name);
    if (!s) continue;
    if (r.from == null || r.to == null || r.to <= r.from) {
      problems.push(s.name + ' ' + r.date + ': break ' + (r.n + 1) + ' is incomplete or ends before it starts, skipped');
      continue;
    }
    get(s, r.date).breaks.push([r.from, r.to]);
  }
  for (const it of items.values()) it.breaks.sort((a, b) => a[0].localeCompare(b[0]));

  const list = [...items.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const exist = await existingDays([...new Set(list.map((i) => i.staff))], from, to);
  const conflicts = [];
  const fresh = [];
  for (const it of list) {
    const app = exist.get(it.key);
    if (app) conflicts.push({ key: it.key, name: it.name, date: it.date, excel: describe(it), app, breaksOnly: it.breaksOnly });
    else if (it.breaksOnly) problems.push(it.name + ' ' + it.date + ': breaks on the sheet but no check in anywhere, skipped');
    else fresh.push(it);
  }
  const days = new Map();
  for (const it of fresh) days.set(it.date, (days.get(it.date) || 0) + 1);

  return {
    from, to,
    items: list.filter((i) => !(i.breaksOnly && !exist.get(i.key))),
    fresh: fresh.length,
    freshEntries: fresh.reduce((a, i) => a + 2 + i.breaks.length * 2, 0),
    days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    conflicts,
    unmatched: [...unmatched.values()],
    problems,
    readAtt: att.length,
    readBrk: brk.length,
    hadAtt: !!attFile,
    hadBrk: !!brkFile,
  };
}

export { validTime, kindText };
