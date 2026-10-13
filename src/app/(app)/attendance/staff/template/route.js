import ExcelJS from 'exceljs';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES } from '@/lib/att';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

// Blank upload template for the Employees page.
export async function GET() {
  const u = await requireUser(ATT_ROLES);
  if (!can(u, 'att_staff')) return new Response('Not allowed', { status: 403 });
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OpsTrack';
  const ws = wb.addWorksheet('Employees');
  ws.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Department', key: 'dept', width: 24 },
    { header: 'Office', key: 'office', width: 10 },
    { header: 'Code (optional)', key: 'code', width: 18 },
  ];
  ws.addRow({ name: 'Ali Khan', dept: 'Security', office: 'ISB', code: '' });
  ws.addRow({ name: 'Sara Ahmed', dept: 'Accounts', office: 'LHR', code: '' });
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3AD21' } };
  for (let r = 2; r <= 300; r++) {
    ws.getCell('C' + r).dataValidation = { type: 'list', allowBlank: true, formulae: ['"LHR,ISB"'] };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employees-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
