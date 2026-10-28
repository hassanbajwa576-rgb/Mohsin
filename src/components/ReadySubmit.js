'use client';

import { useState } from 'react';
import OfficeTag from './OfficeTag';

const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Expenses ready for Accounts with a tick box on each, select all, and a live total of what is ticked.
export default function ReadySubmit({ rows, action }) {
  const [on, setOn] = useState(() => new Set(rows.map((r) => r.id)));
  const [term, setTerm] = useState('');
  // A number finds amounts that contain it (4200 or 4,200 finds PKR 4,200); words find the category, details, fund or person.
  const needle = term.trim().toLowerCase();
  const digits = needle.replace(/[,\s]|pkr|rs\.?/g, '');
  const numeric = /^\d+(\.\d+)?$/.test(digits);
  const shown = !needle ? rows : rows.filter((r) => (numeric ? String(Math.round(r.amount * 100) / 100).includes(digits) : [r.category, r.description, r.fund, r.submitter, r.office, r.spent_on].join(' ').toLowerCase().includes(needle)));
  // Searching selects just what was found, so one tap on Submit sends only those; clearing the search selects everything again.
  const search = (v) => {
    setTerm(v);
    const nd = v.trim().toLowerCase();
    if (!nd) {
      setOn(new Set(rows.map((r) => r.id)));
      return;
    }
    const dg = nd.replace(/[,\s]|pkr|rs\.?/g, '');
    const num = /^\d+(\.\d+)?$/.test(dg);
    setOn(new Set(rows.filter((r) => (num ? String(Math.round(r.amount * 100) / 100).includes(dg) : [r.category, r.description, r.fund, r.submitter, r.office, r.spent_on].join(' ').toLowerCase().includes(nd))).map((r) => r.id)));
  };
  const picked = shown.filter((r) => on.has(r.id));
  const all = shown.length > 0 && picked.length === shown.length;
  const total = picked.reduce((a, r) => a + r.amount, 0);
  const toggle = (id) => setOn((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <form action={action}>
      <div className='ready-search'>
        <input type='search' inputMode='search' value={term} onChange={(e) => search(e.target.value)} placeholder='Find by amount, e.g. 4200, or by name or details' aria-label='Search expenses' autoComplete='off' />
        {needle ? <span className='muted'>{shown.length} of {rows.length} match</span> : null}
      </div>
      <div className='tablewrap'>
        <table className='tx'>
          <thead>
            <tr>
              <th><input type='checkbox' checked={all} onChange={() => setOn((s) => { const n = new Set(s); shown.forEach((r) => (all ? n.delete(r.id) : n.add(r.id))); return n; })} aria-label='Select all' /></th>
              <th>Date</th><th>Details</th><th>Fund</th><th>By</th><th className='r'>Amount</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={6} className='muted'>No expense matches that.</td></tr> : null}
            {shown.map((r) => (
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
        <b>{picked.length}</b> of {shown.length} selected - <b>{pkr(total)}</b>
        {' '}
        <button type='button' className='btn ghost' onClick={() => setOn((s) => new Set([...s, ...shown.map((r) => r.id)]))}>Select all</button>
        <button type='button' className='btn ghost' onClick={() => setOn(new Set())}>Clear</button>
      </p>
      <input type='hidden' name='ids' value={picked.map((r) => r.id).join(',')} />
      <div className='form'>
        <label className='wide'>Note for Accounts<input name='note' placeholder='Optional, e.g. October petty cash settlement' /></label>
        <button className='btn primary' type='submit' disabled={picked.length === 0}>{'Submit ' + picked.length + ' to Accounts'}</button>
      </div>
    </form>
  );
}
