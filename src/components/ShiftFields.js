'use client';

import { useState } from 'react';

const SHIFTS = [['', 'None'], ['morning', 'Morning'], ['evening', 'Evening'], ['night', 'Night']];

// Shift picker for an employee: Morning, Evening or Night with editable start and end times.
// Morning starts at 9:30 AM and ends at 6:00 PM unless changed; Evening and Night times are typed in.
export default function ShiftFields({ shift = '', start = '', end = '' }) {
  const [sh, setSh] = useState(shift);
  const [a, setA] = useState(start);
  const [b, setB] = useState(end);

  function pick(v) {
    setSh(v);
    if (v === 'morning') {
      if (!a) setA('09:30');
      if (!b) setB('18:00');
    }
  }

  return (
    <div className='shiftfields wide'>
      <span className='att-lbl'>Shift</span>
      <div className='att-seg' role='radiogroup' aria-label='Shift'>
        {SHIFTS.map(([v, label]) => (
          <label key={v || 'none'} className={sh === v ? 'on' : ''}>
            <input type='radio' name='shift' value={v} checked={sh === v} onChange={() => pick(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {sh ? (
        <div className='att-when'>
          <label>Shift starts<input type='time' name='shift_start' value={a} onChange={(e) => setA(e.target.value)} required /></label>
          <label>Shift ends<input type='time' name='shift_end' value={b} onChange={(e) => setB(e.target.value)} required /></label>
        </div>
      ) : null}
      {sh === 'evening' || sh === 'night' ? (
        <label className='checkrow'>
          <input type='checkbox' name='apply_dept' value='1' /> Use these times for everyone in this department on this shift
        </label>
      ) : null}
      <p className='muted'>
        {sh === 'morning' ? 'Check in after the shift start is shown in red, and check out more than 5 minutes before the shift end is red.' : null}
        {sh === 'evening' || sh === 'night' ? 'Check in within 30 minutes of the shift start is green, later is red. A night shift may end after midnight.' : null}
        {!sh ? 'With no shift, the standard rule applies: check in by 9:30 AM and check out from 5:55 PM.' : null}
      </p>
    </div>
  );
}
