'use client';

import { useRef } from 'react';

// A row of drop-downs that reload the page as soon as one is changed. fields: [{ name, label, value, options: [[value, label], ...] }]
export default function AutoFilters({ fields, hidden = {} }) {
  const form = useRef(null);
  return (
    <form ref={form} method='get' className='deptsel autof'>
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type='hidden' name={k} value={v} /> : null))}
      {fields.map((f) => (
        <label key={f.name}>{f.label}
          <select name={f.name} defaultValue={f.value} onChange={() => form.current && form.current.requestSubmit()}>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      ))}
    </form>
  );
}