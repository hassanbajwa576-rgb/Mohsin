import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey, validDate, shiftText, to12 } from '@/lib/att';
import { analyse, addDaysKey } from '@/lib/analysis';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

const mn = (ms) => Math.round(ms / 60000);
const hm = (ms) => {
  const m = mn(ms);
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
};
const pc = (p) => (p == null ? '' : Math.round(p * 10) / 10);

// Attendance analysis as an Excel workbook: one sheet each for employees, departments, shifts and breaks.
// The sheet for the view you were looking at comes first.
export async function GET(req) {
  const u = await requireUser(ATT_ROLES);
  if (!can(u, 'att_reports')) return new Response('Not allowed', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const today = todayKey();
  const to = validDate(sp.get('to') || '') ? sp.get('to') : today;
  let from = validDate(sp.get('from') || '') ? sp.get('from') : addDaysKey(to, -29);
  if (from > to) from = to;
  const office = allOffices(u) ? (['LHR', 'ISB'].includes(sp.get('office')) ? sp.get('office') : '') : u.office_code;
  const depts = sp.getAll('dept').map((d) => d.slice(0, 80)).filter(Boolean);
  const data = await analyse({ from, to, office, depts, who: (sp.get('who') || '').slice(0, 60) });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const sheet = (name, cols, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));
    rows.forEach((r) => ws.addRow(r));
    const h = ws.getRow(1);
    h.font = { bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };

  const groupCols = [
    ['People', 'people', 9], ['Attendance %', 'att', 13], ['On time %', 'ot', 11], ['Late check ins', 'late', 14],
    ['Early check outs', 'early', 16], ['Avg worked (h:mm)', 'worked', 17], ['Avg break (min)', 'brk', 15], ['Shifts with over 1 h of breaks', 'over', 28],
  ];
  const groupRow = (g) => ({ label: g.label, people: g.people, att: pc(g.attendancePct), ot: pc(g.onTimePct), late: g.late, early: g.early, worked: g.closedN ? hm(g.avgWorked) : '', brk: g.closedN ? mn(g.avgBreak) : '', over: g.over });

  const builders = {
    employees: () => sheet('Employees', [
      ['Employee', 'name', 28], ['Department', 'dept', 18], ['Office', 'office', 9], ['Shift', 'shift', 28], ['Days present', 'days', 13],
      ['Working days', 'exp', 14], ['Attendance %', 'att', 13], ['Average check in', 'avgin', 16], ['Late check ins', 'late', 14],
      ['Early check outs', 'early', 16], ['Missed check outs', 'missed', 17], ['Avg worked (h:mm)', 'worked', 17], ['Avg break (min)', 'brk', 15],
      ['Shifts with over 1 h of breaks', 'over', 28], ['On time %', 'ot', 11],
    ], data.rows.map((r) => ({
      name: r.name, dept: r.dept || '', office: r.office, shift: r.shift ? shiftText(r) : '', days: r.days, exp: r.expected, att: pc(r.attendancePct),
      avgin: r.avgIn ? to12(r.avgIn) : '', late: r.late, early: r.early, missed: r.missed, worked: r.closedN ? hm(r.avgWorked) : '',
      brk: r.closedN ? mn(r.avgBreak) : '', over: r.overShifts, ot: pc(r.onTimePct),
    }))),
    departments: () => sheet('Departments', [['Department', 'label', 24], ...groupCols], data.byDept.map(groupRow)),
    shifts: () => sheet('Shifts', [['Shift', 'label', 18], ...groupCols], data.byShift.map(groupRow)),
    breaks: () => {
      const rows = [
        { a: 'Breaks taken', b: data.breaks.count },
        { a: 'Average break (min)', b: data.breaks.count ? mn(data.breaks.avgMs) : '' },
        { a: 'Single breaks over 1 hour', b: data.breaks.over1h },
        { a: 'Longest break (min)', b: data.breaks.longest ? mn(data.breaks.longest.ms) : '' },
        { a: 'Longest break by', b: data.breaks.longest ? data.breaks.longest.name + ' on ' + data.breaks.longest.date : '' },
        { a: '', b: '' },
        ...data.breaks.buckets.map((b) => ({ a: 'Breaks: ' + b.label, b: b.n })),
        { a: '', b: '' },
        { a: 'Shifts with over 1 h of breaks, by employee', b: '' },
        ...data.breaks.top.map((r) => ({ a: r.name + ' (' + (r.dept || '-') + ')', b: r.overShifts + ' shifts, average break ' + mn(r.avgBreak) + ' min' })),
      ];
      return sheet('Breaks', [['Measure', 'a', 46], ['Value', 'b', 46]], rows);
    },
  };
  const first = builders[sp.get('view')] ? sp.get('view') : 'employees';
  builders[first]();
  Object.keys(builders).filter((k) => k !== first).forEach((k) => builders[k]());

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="attendance-analysis-' + from + '-to-' + to + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
