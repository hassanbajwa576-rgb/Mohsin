'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// A table whose parent rows open and close, like the + and - outline buttons in Excel.
// A row is a parent when the row after it is indented deeper (higher level); its children are every row below it until the level comes back.
// head: [{ t, href, sel, r }]   rows: [{ k, level, cls, bold, label, cells: [{ t, c }] , foot }]
export default function OutlineTable({ head, rows, tfoot }) {
  const [open, setOpen] = useState(() => new Set());
  // The column headings stay in view under the top bar while the page scrolls.
  useEffect(() => {
    const set = () => { const n = document.querySelector('.nav'); document.documentElement.style.setProperty('--navh', (n ? n.offsetHeight : 0) + 'px'); };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);
  const isParent = (i) => i + 1 < rows.length && rows[i + 1].level > rows[i].level;
  const parents = rows.map((r, i) => (isParent(i) ? r.k : null)).filter((k) => k !== null);
  const toggle = (k) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  let hideBelow = null;
  const shown = [];
  rows.forEach((r, i) => {
    if (hideBelow !== null && r.level > hideBelow) return;
    hideBelow = null;
    shown.push([r, i]);
    if (isParent(i) && !open.has(r.k)) hideBelow = r.level;
  });

  return (
    <>
      {parents.length ? (
        <div className='er-tools'>
          <button type='button' className='btn' onClick={() => setOpen(new Set(parents))}>Expand all</button>
          <button type='button' className='btn ghost' onClick={() => setOpen(new Set())}>Collapse all</button>
        </div>
      ) : null}
      <div className='tablewrap er-wrap'>
        <table className='tx er-grid'>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className={(h.r ? 'r' : '') + (h.sel ? ' er-sel' : '')}>{h.href ? <Link href={h.href}>{h.t}</Link> : h.t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(([r, i]) => {
              const parent = isParent(i);
              const on = open.has(r.k);
              return (
                <tr key={r.k} className={r.cls}>
                  <td className='c-title'>
                    <span className='er-lab' style={{ paddingLeft: r.level * 16 }}>
                      {parent ? (
                        <button type='button' className='er-tog' aria-expanded={on} aria-label={(on ? 'Collapse ' : 'Expand ') + r.label} onClick={() => toggle(r.k)}>{on ? '−' : '+'}</button>
                      ) : <span className='er-tog-sp' />}
                      {r.bold ? <b>{r.label}</b> : r.label}
                    </span>
                  </td>
                  {r.cells.map((c, j) => <td key={j} className={'r nw c-meta ' + (c.c || '')}><span className='er-cl'>{head[j + 1] ? head[j + 1].t : ''}</span>{c.bold ? <b>{c.t}</b> : c.t}</td>)}
                </tr>
              );
            })}
          </tbody>
          {tfoot ? (
            <tfoot>
              <tr>
                <td>{tfoot.label}</td>
                {tfoot.cells.map((c, j) => <td key={j} className={'r nw ' + (c.c || '')}>{c.t}</td>)}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
}
