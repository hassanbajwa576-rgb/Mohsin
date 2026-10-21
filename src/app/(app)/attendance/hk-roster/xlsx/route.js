import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TINFO, daysIn, validMonth, monthOff, hkPeople } from '@/lib/roster';

export const dynamic = 'force-dynamic';

// The month's roster as a grid: one row per employee, one column per day.
export async function GET(req) {
  const u = await requireUser(ATT_ROLES);
  const sp = new URL(req.url).searchParams;
  const month = validMonth(sp.get('m')) ? sp.get('m') : todayKey().slice(0, 7);
  const office = allOffices(u) ? (['LHR', 'ISB'].includes(sp.get('office')) ? sp.get('office') : '') : u.office_code;
  const who = (sp.get('who') || '').slice(0, 60);
  const entries = await monthOff({ month, office, who });
  const people = sp.get('all') === '1'
    ? await hkPeople({ office, who })
    : [...new Map(entries.map((e) => [e.staff_id, { id: e.staff_id, name: e.name, dept: e.dept, office: e.office }])).values()];
  const n = daysIn(month);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const ws = wb.addWorksheet('HK roster ' + month);
  ws.columns = [
    { header: 'Team member', key: 'name', width: 28 }, { header: 'Office', key: 'office', width: 8 }, { header: 'Role', key: 'dept', width: 20 },
    ...Array.from({ length: n }, (_, i) => ({ header: String(i + 1), key: 'd' + (i + 1), width: 4.5 })),
    { header: 'Full days', key: 'total', width: 10 },
    { header: 'Hours (part days)', key: 'hrs', width: 16 },
  ];
  for (const p of people) {
    const row = { name: p.name, office: p.office, dept: p.dept || '', total: 0, hrs: 0 };
    const colors = {};
    for (const e of entries.filter((x) => x.staff_id === p.id)) {
      for (let d = 1; d <= n; d++) {
        const key = month + '-' + String(d).padStart(2, '0');
        if (key >= e.from_date && key <= e.to_date) {
          row['d' + d] = TINFO[e.kind].letter + (e.hours != null ? ' ' + e.hours + 'h' : '');
          colors[d] = TINFO[e.kind].color.replace('#', 'FF');
          if (e.hours != null) row.hrs += e.hours;
          else row.total += 1;
        }
      }
    }
    const r = ws.addRow(row);
    Object.entries(colors).forEach(([d, argb]) => {
      const c = r.getCell(3 + Number(d));
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      c.alignment = { horizontal: 'center' };
    });
  }
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  const lg = wb.addWorksheet('Key');
  lg.addRows(Object.values(TINFO).map((t) => [t.letter, t.label]));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="hk-roster-' + month + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}