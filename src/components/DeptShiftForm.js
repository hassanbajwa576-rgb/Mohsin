'use client';

import { useState } from 'react';
import ShiftFields from './ShiftFields';
import DeptPicker from './DeptPicker';

// Give one shift to one or more departments at once. Everyone in them follows it unless they have their own shift.
export default function DeptShiftForm({ depts, action }) {
  const [on, setOn] = useState([]);

  return (
    <form action={action} className='form'>
      <div className='wide'>
        <span className='att-lbl'>Departments (pick one or more)</span>
        <DeptPicker depts={depts} value={on} onChange={setOn} />
      </div>
      <ShiftFields noneLabel='No shift' noneHint='No department shift. Saving removes the shift from the ticked departments.' />
      <button className='btn primary' type='submit'>
        {on.length ? 'Save for ' + on.length + (on.length === 1 ? ' department' : ' departments') : 'Save department shift'}
      </button>
    </form>
  );
}
