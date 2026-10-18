'use client';

import { useState } from 'react';

const SHIFTS = [['', 'None'], ['morning', 'Morning'], ['evening', 'Evening'], ['night', 'Night']];

// Shift picker for an employee: Morning, Evening or Night with editable start and end times.
// Morning starts at 9:30 AM and ends at 6:00 PM unless changed; Evening and Night times are typed in.
export default function ShiftFields({ shift = '', start = '', end = '', noneLabel = 'None', noneHint = 'With no shift of their own, a person follows their department shift if there is one, otherwise the standard rule: check in by 9:30 AM (green until 10:00 AM with the 30 minute grace) and check out from 5:55 PM.' }) {
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
            <span>{v ? label : noneLabel}</span>
          </label>
        ))}
      </div>
      {sh ? (
        <div className='att-when'>
          <label>Shift starts<input type='time' name='shift_start' value={a} onChange={(e) => setA(e.target.value)} required /></label>
          <label>Shift ends<input type='time' name='shift_end' value={b} onChange={(e) => setB(e.target.value)} required /></label>
        </div>
      ) : null}

      <p className='muted'>
        {sh === 'morning' ? 'Check in up to 30 minutes after the shift start is green, later is red. Check out more than 5 minutes before the shift end is red.' : null}
        {sh === 'evening' || sh === 'night' ? 'Check in up to 30 minutes after the shift start is green, later is red. A night shift may end after midnight.' : null}
        {!sh ? noneHint : null}
      </p>
    </div>
  );
}
