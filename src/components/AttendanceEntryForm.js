'use client';

import { useEffect, useState } from 'react';

// [value, label, short explanation]
const KINDS = [
  ['in', 'Check In', 'starts work'],
  ['out', 'Check Out', 'leaves for the day'],
  ['break_out', 'Break Out', 'goes out for a break'],
  ['break_in', 'Break In', 'back from the break'],
];

// Current date / time in Pakistan, so the form always starts at "now" even if it was left open.
function nowPk() {
  const d = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return { date, time };
}

export default function AttendanceEntryForm({ options, action }) {
  const [staffId, setStaffId] = useState(options[0] ? String(options[0].id) : '');
  const [kind, setKind] = useState(options[0] ? options[0].suggested : 'in');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    const n = nowPk();
    setDate(n.date);
    setTime(n.time);
  }, []);

  const offices = [...new Set(options.map((o) => o.office))];

  function pick(v) {
    setStaffId(v);
    const o = options.find((x) => String(x.id) === v);
    if (o) setKind(o.suggested);
  }

  function useNow() {
    const n = nowPk();
    setDate(n.date);
    setTime(n.time);
  }

  if (!options.length) return <p className='muted'>No employees have been added for your office yet. Ask the Sr. Ops Manager to add them.</p>;

  return (
    <form action={action} className='att-form'>
      <label>Employee
        <select name='staff_id' value={staffId} onChange={(e) => pick(e.target.value)} required>
          {offices.map((off) => (
            <optgroup key={off} label={off}>
              {options.filter((o) => o.office === off).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className='att-seg' role='radiogroup' aria-label='Entry type'>
        {KINDS.map(([k, label, hint]) => (
          <label key={k} className={kind === k ? 'on' : ''}>
            <input type='radio' name='kind' value={k} checked={kind === k} onChange={() => setKind(k)} required />
            <span>{label}</span>
            <small>{hint}</small>
          </label>
        ))}
      </div>

      <div className='att-when'>
        <label>Date<input type='date' name='date' value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label>Time<input type='time' name='time' value={time} onChange={(e) => setTime(e.target.value)} required /></label>
        <button type='button' className='btn ghost' onClick={useNow}>Use current time</button>
      </div>

      <button className='btn primary att-submit' type='submit'>Add entry</button>
    </form>
  );
}
