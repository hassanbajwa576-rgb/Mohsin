import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, reportRows, breakFilter, todayKey, validDate } from '@/lib/att';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

const DQ = String.fromCharCode(34);
const AP = String.fromCharCode(39);

// Quote every cell and neutralise spreadsheet formula injection.
function cell(v) {
  let s = String(v ?? '');
  if (['=', '+', '-', '@'].includes(s[0])) s = AP + s;
  return DQ + s.split(DQ).join(DQ + DQ) + DQ;
}

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
  const rows = breakFilter(await reportRows({ from, to, office, dept: sp.getAll('dept').map((d) => d.slice(0, 80)).filter(Boolean) }), sp.get('brk'));
  const mins = (ms) => Math.round(ms / 60000);
  const header = ['Date', 'Office', 'Employee', 'Check In', 'Check Out', 'Breaks', 'Break minutes', 'Worked minutes'];
  const lines = [header.map(cell).join(',')].concat(
    rows.map((r) => [r.date, r.office, r.name, r.in, r.out, r.breaks, mins(r.breakMs), mins(r.workedMs)].map(cell).join(','))
  );
  return new Response('ï»¿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=' + DQ + 'attendance-' + from + '-to-' + to + '.csv' + DQ,
      'Cache-Control': 'no-store',
    },
  });
}
