'use client';

import { useState } from 'react';
import OfficeTag from './OfficeTag';

const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Expenses ready for Accounts with a tick box on each, select all, and a live total of what is ticked.
export default function ReadySubmit({ rows, action }) {
  const [on, setOn] = useState(() => new Set(rows.map((r) => r.id)));
  const all = on.size === rows.length;
  const total = rows.filter((r) => on.has(r.id)).reduce((a, r) => a + r.amount, 0);
  const toggle = (id) => setOn((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <form action={action}>
      <div className='tablewrap'>
        <table className='tx'>
          <thead>
            <tr>
              <th><input type='checkbox' checked={all} onChange={() => setOn(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label='Select all' /></th>
              <th>Date</th><th>Details</th><th>Fund</th><th>By</th><th className='r'>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => toggle(r.id)} style={{ cursor: 'pointer', opacity: on.has(r.id) ? 1 : 0.55 }}>
                <td className='c-chk'><input type='checkbox' checked={on.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} aria-label={'Select expense ' + r.id} /></td>
                <td className='nw c-meta'>{r.spent_on}</td>
                <td className='c-title'>
                  <OfficeTag o={r.office} /><b>{r.category}</b>
                  {r.description ? <div className='muted'>{r.description}</div> : null}
                </td>
                <td className='c-meta'>{r.fund}</td>
                <td className='c-meta'>{r.submitter}</td>
                <td className='r nw c-amt'><b>{pkr(r.amount)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className='totals'>
        <b>{on.size}</b> of {rows.length} selected - <b>{pkr(total)}</b>
        {' '}
        <button type='button' className='btn ghost' onClick={() => setOn(new Set(rows.map((r) => r.id)))}>Select all</button>
        <button type='button' className='btn ghost' onClick={() => setOn(new Set())}>Clear</button>
      </p>
      <input type='hidden' name='ids' value={rows.filter((r) => on.has(r.id)).map((r) => r.id).join(',')} />
      <div className='form'>
        <label className='wide'>Note for Accounts<input name='note' placeholder='Optional, e.g. October petty cash settlement' /></label>
        <button className='btn primary' type='submit' disabled={on.size === 0}>{'Submit ' + on.size + ' to Accounts'}</button>
      </div>
    </form>
  );
}
