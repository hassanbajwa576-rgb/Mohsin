import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TINFO, daysIn, validMonth, monthOff, hkPeople, siteList } from '@/lib/roster';
import { teamOf, siteText } from '@/lib/teams';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

// The month's roster as a grid: one row per employee, one column per day.
export async function GET(req) {
  const u = await requireUser(ATT_ROLES);
  const sp = new URL(req.url).searchParams;
  const okDast = teamOf(sp.get('team')) === 'dast' && can(u, 'dast_edit');
  if (u.role !== 'om' && u.role !== 'sso' && !okDast) return new Response('Not allowed', { status: 403 });
  // The Excel grid is per month; for a custom range it covers the month the range starts in.
  const rawM = validMonth(sp.get('m')) ? sp.get('m') : /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') || '') ? sp.get('from').slice(0, 7) : '';
  const month = validMonth(rawM) ? rawM : todayKey().slice(0, 7);
  const team = teamOf(sp.get('team'));
  const dast = team === 'dast';
  const office = dast ? '' : allOffices(u) ? (['LHR', 'ISB'].includes(sp.get('office')) ? sp.get('office') : '') : u.office_code;
  const site = dast && (await siteList()).includes(sp.get('site')) ? sp.get('site') : '';
  const who = (sp.get('who') || '').slice(0, 60);
  const entries = await monthOff({ month, office, who, team, site });
  const all = await hkPeople({ office, team, site });
  const byId = new Map(all.map((p) => [p.id, p]));
  const people = sp.get('only') !== '1'
    ? await hkPeople({ office, who, team, site })
    : [...new Map(entries.map((e) => [e.staff_id, byId.get(e.staff_id) || { id: e.staff_id, name: e.name, dept: e.dept, office: e.office, site: e.site, sites: [] }])).values()];
  const n = daysIn(month);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const ws = wb.addWorksheet((dast ? 'Dastarkhawan roster ' : 'Support roster ') + month);
  ws.columns = [
    { header: 'Team member', key: 'name', width: 28 }, { header: dast ? 'Sites' : 'Office', key: 'office', width: dast ? 28 : 8 }, { header: 'Role', key: 'dept', width: 20 },
    ...Array.from({ length: n }, (_, i) => ({ header: String(i + 1), key: 'd' + (i + 1), width: 4.5 })),
    { header: 'Full days', key: 'total', width: 10 },
    { header: 'Hours (part days)', key: 'hrs', width: 16 },
  ];
  for (const p of people) {
    const row = { name: p.name, office: dast ? siteText(p.sites) || p.site : p.office, dept: p.dept || '', total: 0, hrs: 0 };
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
      'Content-Disposition': 'attachment; filename="' + (dast ? 'dastarkhawan-roster-' : 'hk-roster-') + month + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}