'use client';

import { useRef } from 'react';

// "All departments" drop-down for the board and the dashboard: picking one reloads the page with that department.
export default function DeptSelect({ depts, value = '', hidden = {} }) {
  const form = useRef(null);
  return (
    <form ref={form} method='get' className='deptsel'>
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type='hidden' name={k} value={v} /> : null))}
      <label>Department
        <select name='dept' defaultValue={value} onChange={() => form.current && form.current.requestSubmit()}>
          <option value=''>All departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
    </form>
  );
}