import { FUNDS } from '@/lib/fmt';

// Rows Petty / BRC / Others, one column per entry of cols (for example LHR and ISB).
export function buildMatrix(list, colKey, cols, amountKey = 'amount') {
  return Object.entries(FUNDS).map(([k, label]) => ({
    label,
    cells: cols.map((c) => list.filter((r) => r.fund === k && r[colKey] === c).reduce((a, r) => a + Number(r[amountKey] || 0), 0)),
  }));
}

const num = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

export default function FundMatrix({ title, cols, rows, note }) {
  const sums = cols.map((_, i) => rows.reduce((a, r) => a + r.cells[i], 0));
  const grand = sums.reduce((a, b) => a + b, 0);
  const many = cols.length > 1;
  return (
    <div className='card'>
      <h3>{title}</h3>
      <div className='tablewrap'>
        <table>
          <thead>
            <tr><th></th>{cols.map((c) => <th key={c} className='r'>{c}</th>)}{many ? <th className='r'>Total</th> : null}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td><b>{r.label}</b></td>
                {r.cells.map((v, i) => <td key={i} className='r nw'>{num(v)}</td>)}
                {many ? <td className='r nw'><b>{num(r.cells.reduce((a, b) => a + b, 0))}</b></td> : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              {sums.map((v, i) => <td key={i} className='r nw' style={{ fontWeight: 700 }}>{num(v)}</td>)}
              {many ? <td className='r nw' style={{ fontWeight: 700 }}>{num(grand)}</td> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      {note ? <p className='muted' style={{ marginTop: 8 }}>{note}</p> : null}
    </div>
  );
}
