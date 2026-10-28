'use client';

import Link from 'next/link';
import { useState } from 'react';

const rs = (n) => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-US');

// The dashboard grid laid out like the workbook's Dashboard sheet: black month headings, one coloured row per cost center
// (with a + to open the expense types under it), the subtotal, the advances and tax rows, and the final total.
// rows: [{ label, vals[12], cls, kids?: [{ label, vals[12] }] }]
export default function XlTable({ months, hrefs, m, rows }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (k) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const parents = rows.filter((r) => r.kids && r.kids.length).map((r) => r.label);
  return (
    <>
      {parents.length ? (
        <div className='er-tools'>
          <button type='button' className='btn' onClick={() => setOpen(new Set(parents))}>Expand all</button>
          <button type='button' className='btn ghost' onClick={() => setOpen(new Set())}>Collapse all</button>
        </div>
      ) : null}
      <div className='tablewrap'>
        <table className='er-xl'>
          <thead>
            <tr>
              <th />
              {months.map((n, i) => <th key={n} className={i + 1 === m ? 'xl-hsel' : ''}><Link href={hrefs[i]}>{n.toUpperCase()}</Link></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.gap) return <tr key={r.label} className='xl-gap'><td colSpan={13} /></tr>;
              const kids = r.kids || [];
              const on = open.has(r.label);
              return [
                <tr key={r.label} className={r.cls}>
                  <th scope='row'>
                    {kids.length ? <button type='button' className='er-tog' aria-expanded={on} aria-label={(on ? 'Collapse ' : 'Expand ') + r.label} onClick={() => toggle(r.label)}>{on ? '−' : '+'}</button> : <span className='er-tog-sp' />}
                    {r.label}
                  </th>
                  {r.vals.map((v, i) => <td key={i} className={i + 1 === m ? 'xl-sel' : ''}>{rs(v)}</td>)}
                </tr>,
                ...(on ? kids.map((k) => (
                  <tr key={r.label + '|' + k.label} className='xl-kid'>
                    <th scope='row'>{k.label}</th>
                    {k.vals.map((v, i) => <td key={i} className={i + 1 === m ? 'xl-sel' : ''}>{rs(v)}</td>)}
                  </tr>
                )) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
