'use client';

import { useState } from 'react';
import ShiftFields from './ShiftFields';

// Give one shift to one or more departments at once. Everyone in them follows it unless they have their own shift.
export default function DeptShiftForm({ depts, action }) {
  const [on, setOn] = useState([]);
  const toggle = (d) => setOn((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]));

  return (
    <form action={action} className='form'>
      <div className='wide'>
        <span className='att-lbl'>Departments (tick one or more)</span>
        <div className='deptgrid'>
          {depts.map((d) => (
            <label key={d} className='checkrow'>
              <input type='checkbox' name='dept' value={d} checked={on.includes(d)} onChange={() => toggle(d)} /> {d}
            </label>
          ))}
        </div>
        <p className='deptlinks'>
          <button type='button' className='linkbtn' onClick={() => setOn(depts)}>Select all</button>
          {' · '}
          <button type='button' className='linkbtn' onClick={() => setOn([])}>Clear</button>
        </p>
      </div>
      <ShiftFields noneLabel='No shift' noneHint='No department shift. Saving removes the shift from the ticked departments.' />
      <button className='btn primary' type='submit'>
        {on.length ? 'Save for ' + on.length + (on.length === 1 ? ' department' : ' departments') : 'Save department shift'}
      </button>
    </form>
  );
}
