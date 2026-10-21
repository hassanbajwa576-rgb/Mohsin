import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, allOffices, todayKey, validDate, fmtTime, dateKey } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import { VLABEL, visitorRows } from '@/lib/visitors';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = await requireUser(ATT_ROLES);
  if (!can(u, 'vis_log')) return new Response('Not allowed', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const today = todayKey();
  const to = validDate(sp.get('to') || '') ? sp.get('to') : today;
  let from = validDate(sp.get('from') || '') ? sp.get('from') : addDay(to, -6);
  if (from > to) from = to;
  const office = allOffices(u) ? (['LHR', 'ISB'].includes(sp.get('office')) ? sp.get('office') : '') : u.office_code;
  const vt = sp.get('vtype');
  const rows = await visitorRows({ from, to, office, vtype: VLABEL[vt] ? vt : '', text: (sp.get('q') || '').slice(0, 60) });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const ws = wb.addWorksheet('Visitors');
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 }, { header: 'Office', key: 'office', width: 8 }, { header: 'Visitor', key: 'name', width: 26 },
    { header: 'Phone', key: 'phone', width: 16 }, { header: 'Company / bank', key: 'company', width: 24 }, { header: 'Type', key: 'type', width: 22 },
    { header: 'Met', key: 'host', width: 24 }, { header: 'In', key: 'in', width: 9 }, { header: 'Out', key: 'out', width: 9 },
    { header: 'Time spent (min)', key: 'mins', width: 16 }, { header: 'Purpose / notes', key: 'purpose', width: 36 }, { header: 'Badge', key: 'badge', width: 9 },
    { header: 'Checked in by', key: 'by', width: 20 },
  ];
  rows.forEach((v) => ws.addRow({
    date: dateKey(v.in_ms), office: v.office, name: v.name, phone: v.phone, company: v.company, type: VLABEL[v.vtype], host: v.host,
    in: fmtTime(v.in_ms), out: v.out_ms ? fmtTime(v.out_ms) : 'inside', mins: v.out_ms ? Math.round((Number(v.out_ms) - Number(v.in_ms)) / 60000) : '',
    purpose: v.purpose, badge: v.badge, by: v.by_name || '',
  }));
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="visitors-' + from + '-to-' + to + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}