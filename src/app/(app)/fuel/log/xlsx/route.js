import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { todayKey, validDate, dateKey, fmtTime } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import { fuelRows, fuelScope, FKIND } from '@/lib/fuel';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = await requireUser(['om', 'sso', 'so', 'guard']);
  if (!can(u, 'fuel_use')) return new Response('Not allowed', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const today = todayKey();
  const to = validDate(sp.get('to') || '') ? sp.get('to') : today;
  let from = validDate(sp.get('from') || '') ? sp.get('from') : addDay(to, -29);
  if (from > to) from = to;
  const kind = FKIND[sp.get('kind')] ? sp.get('kind') : '';
  const rows = await fuelRows({ from, to, asset: Number(sp.get('asset')) || 0, kind, scope: await fuelScope(u) });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const ws = wb.addWorksheet('Fuel');
  ws.columns = [
    { header: 'Date', key: 'd', width: 12 }, { header: 'Time', key: 't', width: 9 }, { header: 'Card', key: 'a', width: 18 }, { header: 'What', key: 'k', width: 18 },
    { header: 'Amount (PKR)', key: 'amt', width: 14 }, { header: 'Litres', key: 'l', width: 9 }, { header: 'Meter reading', key: 'r', width: 14 },
    { header: 'Note', key: 'n', width: 32 }, { header: 'Recorded by', key: 'by', width: 20 },
  ];
  rows.forEach((t) => ws.addRow({ d: dateKey(t.at_ms), t: fmtTime(t.at_ms), a: t.asset, k: FKIND[t.kind], amt: t.kind === 'fill' ? -t.amount : t.amount, l: t.litres ?? '', r: t.reading ?? '', n: t.note, by: t.by_name || '' }));
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="fuel-' + from + '-to-' + to + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}