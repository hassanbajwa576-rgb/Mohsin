const DQ = String.fromCharCode(34);
const AP = String.fromCharCode(39);

// Quote a cell and neutralise spreadsheet formula injection.
export function cell(v) {
  let s = String(v ?? '');
  if (['=', '+', '-', '@'].includes(s[0])) s = AP + s;
  return DQ + s.split(DQ).join(DQ + DQ) + DQ;
}

export function toCsv(header, rows) {
  return '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function csvResponse(body, filename) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=' + DQ + filename + DQ,
      'Cache-Control': 'no-store',
    },
  });
}
