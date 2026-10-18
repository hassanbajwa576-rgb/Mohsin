import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, reportRows, breakFilter, todayKey, validDate } from '@/lib/att';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

const mins = (ms) => Math.round(ms / 60000);
const hhmm = (ms) => {
  const m = mins(ms);
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
};

// Attendance report as a real Excel workbook: one row per shift, plus a summary per employee.
export async function GET(req) {
  const u = await requireUser(ATT_ROLES);
  if (!can(u, 'att_reports')) return new Response('Not allowed', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const today = todayKey();
  const to = validDate(sp.get('to') || '') ? sp.get('to') : today;
  let from = validDate(sp.get('from') || '') ? sp.get('from') : today.slice(0, 8) + '01';
  if (from > to) from = to;
  // Own office only unless the person works across both offices.
  const office = allOffices(u) ? (['LHR', 'ISB'].includes(sp.get('office')) ? sp.get('office') : '') : u.office_code;
  const dept = sp.getAll('dept').map((d) => d.slice(0, 80)).filter(Boolean);
  const rows = breakFilter(await reportRows({ from, to, office, dept }), sp.get('brk'));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const style = (ws) => {
    const h = ws.getRow(1);
    h.font = { bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  };

  const ws = wb.addWorksheet('Attendance');
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Office', key: 'office', width: 9 },
    { header: 'Department', key: 'dept', width: 20 },
    { header: 'Employee', key: 'name', width: 28 },
    { header: 'Check In', key: 'in', width: 10 },
    { header: 'Check Out', key: 'out', width: 11 },
    { header: 'Breaks', key: 'breaks', width: 8 },
    { header: 'Break time (min)', key: 'brk', width: 16 },
    { header: 'Worked (h:mm)', key: 'worked', width: 14 },
  ];
  rows.forEach((r) => ws.addRow({
    date: r.date, office: r.office, dept: r.dept || '', name: r.name, in: r.in, out: r.out,
    breaks: r.breaks, brk: mins(r.breakMs), worked: hhmm(r.workedMs),
  }));
  style(ws);

  const sum = new Map();
  rows.forEach((r) => {
    const k = r.office + '|' + r.name;
    const x = sum.get(k) || { office: r.office, dept: r.dept || '', name: r.name, shifts: 0, work: 0, brk: 0 };
    x.shifts += 1;
    x.work += r.workedMs;
    x.brk += r.breakMs;
    sum.set(k, x);
  });
  const ss = wb.addWorksheet('Summary');
  ss.columns = [
    { header: 'Office', key: 'office', width: 9 },
    { header: 'Department', key: 'dept', width: 20 },
    { header: 'Employee', key: 'name', width: 28 },
    { header: 'Shifts', key: 'shifts', width: 9 },
    { header: 'Total worked (h:mm)', key: 'work', width: 20 },
    { header: 'Total break (min)', key: 'brk', width: 18 },
  ];
  Array.from(sum.values())
    .sort((a, b) => a.office.localeCompare(b.office) || a.dept.localeCompare(b.dept) || a.name.localeCompare(b.name))
    .forEach((x) => ss.addRow({ office: x.office, dept: x.dept, name: x.name, shifts: x.shifts, work: hhmm(x.work), brk: mins(x.brk) }));
  style(ss);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="attendance-' + from + '-to-' + to + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
