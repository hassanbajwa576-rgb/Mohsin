'use client';

import { useState } from 'react';
import TimePick from '@/components/TimePick';

const SCOPES = [['department', 'Departments'], ['employee', 'Specific employees'], ['everyone', 'Everyone']];

// Temporary hours: pick who, the dates and the start and end times. They end by themselves after the last date.
export default function TempHoursForm({ depts, staff, action, today }) {
  const [scope, setScope] = useState('department');
  const [dsel, setDsel] = useState([]);
  const [ssel, setSsel] = useState([]);
  const [text, setText] = useState('');
  const toggle = (set, v) => set((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const shown = staff.filter((p) => (p.name + ' ' + p.dept).toLowerCase().includes(text.trim().toLowerCase()));
  const n = scope === 'department' ? dsel.length : scope === 'employee' ? ssel.length : 1;

  return (
    <form action={action} className='form'>
      <div className='wide'>
        <span className='att-lbl'>Applies to</span>
        <div className='att-seg' role='radiogroup' aria-label='Applies to'>
          {SCOPES.map(([v, label]) => (
            <label key={v} className={scope === v ? 'on' : ''}>
              <input type='radio' name='scope' value={v} checked={scope === v} onChange={() => setScope(v)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {scope === 'department' ? (
        <div className='wide'>
          <span className='att-lbl'>Departments (tick one or more)</span>
          <div className='deptgrid'>
            {depts.map((d) => (
              <label key={d} className='checkrow'>
                <input type='checkbox' name='dept' value={d} checked={dsel.includes(d)} onChange={() => toggle(setDsel, d)} /> {d}
              </label>
            ))}
          </div>
          <p className='deptlinks'>
            <button type='button' className='linkbtn' onClick={() => setDsel(depts)}>Select all</button>
            {' · '}
            <button type='button' className='linkbtn' onClick={() => setDsel([])}>Clear</button>
          </p>
        </div>
      ) : null}

      {scope === 'employee' ? (
        <div className='wide'>
          <span className='att-lbl'>Employees (tick one or more)</span>
          <input className='dsearch' type='search' placeholder='Search by name or department' value={text} onChange={(e) => setText(e.target.value)} />
          <div className='deptgrid staffgrid'>
            {shown.map((p) => (
              <label key={p.id} className='checkrow'>
                <input type='checkbox' name='staff' value={p.id} checked={ssel.includes(p.id)} onChange={() => toggle(setSsel, p.id)} /> {p.name} <span className='muted'>{p.dept || ''}</span>
              </label>
            ))}
            {!shown.length ? <p className='muted'>No employee matches.</p> : null}
          </div>
          <p className='deptlinks'>
            <button type='button' className='linkbtn' onClick={() => setSsel((s) => [...new Set([...s, ...shown.map((p) => p.id)])])}>Select all shown</button>
            {' · '}
            <button type='button' className='linkbtn' onClick={() => setSsel([])}>Clear</button>
          </p>
        </div>
      ) : null}

      <label>From date<input type='date' name='from_date' defaultValue={today} required /></label>
      <label>To date (last day)<input type='date' name='to_date' defaultValue={today} required /></label>
      <label>Starts<TimePick name='shift_start' required /></label>
      <label>Ends<TimePick name='shift_end' required /></label>
      <label className='wide'>Note (optional)<input name='note' maxLength={80} placeholder='For example: Ramadan hours' /></label>
      <p className='muted wide'>Check in up to 30 minutes after the start is green, and check out from 5 minutes before the end is green. After the last date everyone is back on their normal shift automatically.</p>
      <button className='btn primary' type='submit'>
        {scope === 'everyone' ? 'Save temporary hours for everyone' : 'Save temporary hours' + (n ? ' (' + n + ')' : '')}
      </button>
    </form>
  );
}
