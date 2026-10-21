import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { OPD_LIMIT, opdSummary, opdClaims } from '@/lib/hk-opd';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const u = await requireUser(ATT_ROLES);
  if (u.role !== 'om' && u.role !== 'sso') return new Response('Not allowed', { status: 403 });
  const sp = new URL(req.url).searchParams;
  const year = /^\d{4}$/.test(sp.get('y') || '') ? sp.get('y') : todayKey().slice(0, 4);
  const office = allOffices(u) ? (['LHR', 'ISB'].includes(sp.get('office')) ? sp.get('office') : '') : u.office_code;
  const people = await opdSummary(year, office);
  const claims = await opdClaims(year, office);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const head = (ws) => {
    const h = ws.getRow(1);
    h.font = { bold: true };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const a = wb.addWorksheet('OPD ' + year);
  a.columns = [
    { header: 'Team member', key: 'name', width: 28 }, { header: 'Office', key: 'office', width: 8 }, { header: 'Role', key: 'role', width: 20 },
    { header: 'Annual limit', key: 'limit', width: 14 }, { header: 'Availed', key: 'availed', width: 14 }, { header: 'Available', key: 'available', width: 14 }, { header: '% used', key: 'pct', width: 9 },
  ];
  people.forEach((p) => a.addRow({ name: p.name, office: p.office, role: p.role || '', limit: OPD_LIMIT, availed: Number(p.availed), available: p.available, pct: Math.round((Number(p.availed) / OPD_LIMIT) * 100) }));
  head(a);
  const b = wb.addWorksheet('Claims');
  b.columns = [{ header: 'Date', key: 'd', width: 12 }, { header: 'Team member', key: 'n', width: 28 }, { header: 'Office', key: 'o', width: 8 }, { header: 'Amount', key: 'a', width: 12 }, { header: 'Note', key: 'note', width: 36 }, { header: 'Added by', key: 'by', width: 20 }];
  claims.forEach((c) => b.addRow({ d: c.claim_date, n: c.name, o: c.office, a: c.amount, note: c.note, by: c.by_name || '' }));
  head(b);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="hk-opd-' + year + '.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}