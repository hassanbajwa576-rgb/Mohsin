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

export default function AttendanceEntryForm({ options, action, defaultOffice }) {
  const offices = [...new Set(options.map((o) => o.office))];
  const [office, setOffice] = useState(offices.includes(defaultOffice) ? defaultOffice : offices[0] || '');
  const [text, setText] = useState('');
  const [picked, setPicked] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState('in');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    const n = nowPk();
    setDate(n.date);
    setTime(n.time);
  }, []);

  // Employees of the chosen office, narrowed by what has been typed.
  const inOffice = options.filter((o) => o.office === office);
  const q = text.trim().toLowerCase();
  const matches = (q ? inOffice.filter((o) => o.label.toLowerCase().includes(q)) : inOffice).slice(0, 8);
  // A single remaining match counts as chosen, so typing "zub" is enough.
  const effectiveId = picked || (q && matches.length === 1 ? String(matches[0].id) : '');
  const chosen = options.find((o) => String(o.id) === effectiveId);

  // Suggest the most likely next entry for the chosen employee.
  useEffect(() => {
    if (chosen) setKind(chosen.suggested);
  }, [effectiveId]);

  function chooseOffice(o) {
    setOffice(o);
    setPicked('');
    setText('');
    setErr('');
  }

  function pick(o) {
    setPicked(String(o.id));
    setText(o.label);
    setOpen(false);
    setErr('');
  }

  function useNow() {
    const n = nowPk();
    setDate(n.date);
    setTime(n.time);
  }

  if (!options.length) return <p className='muted'>No employees have been added for your office yet. Ask the Sr. Ops Manager to add them.</p>;

  return (
    <form
      action={action}
      className='att-form'
      onSubmit={(e) => {
        if (!effectiveId) {
          e.preventDefault();
          setErr('Choose an employee from the list');
        }
      }}
    >
      <div className='att-field'>
        <span className='att-lbl'>Office</span>
        <div className='att-seg att-office' role='radiogroup' aria-label='Office'>
          {offices.map((o) => (
            <label key={o} className={office === o ? 'on' : ''}>
              <input type='radio' value={o} checked={office === o} onChange={() => chooseOffice(o)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </div>

      <div className='att-field att-search'>
        <label htmlFor='att-emp' className='att-lbl'>Employee</label>
        <input
          id='att-emp'
          type='text'
          value={text}
          placeholder={'Type a name in ' + office}
          autoComplete='off'
          onChange={(e) => {
            setText(e.target.value);
            setPicked('');
            setOpen(true);
            setErr('');
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <input type='hidden' name='staff_id' value={effectiveId} />
        {open && matches.length > 0 ? (
          <ul className='att-list' role='listbox'>
            {matches.map((o) => (
              <li key={o.id}>
                <button type='button' onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label}</button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && q && matches.length === 0 ? <p className='att-none'>No employee in {office} matches that name</p> : null}
      </div>

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

      {err ? <p className='att-err'>{err}</p> : null}
      <button className='btn primary att-submit' type='submit'>Add entry</button>
    </form>
  );
}
