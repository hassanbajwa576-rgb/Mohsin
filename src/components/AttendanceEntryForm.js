'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [canListen, setCanListen] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    const n = nowPk();
    setDate(n.date);
    setTime(n.time);
    // Voice search needs the browser speech service (Chrome, Edge, Android; limited on iPhone).
    setCanListen(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  // Employees of the chosen office, narrowed by what has been typed.
  const inOffice = options.filter((o) => o.office === office);
  const q = text.trim().toLowerCase();
  const words = q.split(' ').filter(Boolean);
  let found = q ? inOffice.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))) : inOffice;
  if (q && found.length === 0 && words.length > 1) {
    found = inOffice.filter((o) => words.some((w) => o.label.toLowerCase().includes(w)));
  }
  const matches = found.slice(0, 8);
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

  // Say the employee name: the words fill the search box and the list narrows down.
  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening && recRef.current) {
      recRef.current.stop();
      return;
    }
    const rec = new SR();
    rec.lang = 'en-PK';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let heard = '';
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setText(heard.replace(/[.,!?]/g, '').trim());
      setPicked('');
      setOpen(true);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setErr('The microphone is blocked. Allow it for this site in your browser settings.');
      else if (e.error === 'no-speech') setErr('Did not hear anything. Tap the microphone and say the name.');
      else setErr('Voice search is not available right now. Type the name instead.');
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setErr('');
    setPicked('');
    setText('');
    setOpen(true);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
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
        <div className='att-inputrow'>
        <input
          id='att-emp'
          type='text'
          value={text}
          placeholder={listening ? 'Listening... say the name' : 'Type a name in ' + office}
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
        {canListen ? (
          <button
            type='button'
            className={'att-mic' + (listening ? ' on' : '')}
            onClick={listen}
            aria-label={listening ? 'Stop listening' : 'Say the employee name'}
            title='Say the employee name (uses your browser speech service)'
          >
            <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
              <rect x='9' y='3' width='6' height='11' rx='3' />
              <path d='M5 11a7 7 0 0 0 14 0' />
              <path d='M12 18v3' />
            </svg>
          </button>
        ) : null}
        </div>
        <input type='hidden' name='staff_id' value={effectiveId} />
        {open && matches.length > 0 ? (
          <ul className='att-list' role='listbox'>
            {matches.map((o) => (
              <li key={o.id}>
                <button type='button' onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label}<small className='att-st'>{o.status}</small></button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && q && matches.length === 0 ? <p className='att-none'>No employee in {office} matches that name</p> : null}
      </div>

      {chosen ? (
        <p className='att-hint'><b>{chosen.label}</b> is {String(chosen.status || '').toLowerCase()}. Next step: <b>{(KINDS.find((x) => x[0] === chosen.suggested) || [])[1]}</b> (gold).</p>
      ) : null}
      <div className='att-seg' role='radiogroup' aria-label='Entry type'>
        {KINDS.map(([k, label, hint]) => (
          <label key={k} className={(kind === k ? 'on' : '') + ((chosen ? chosen.suggested : 'in') === k ? ' pend' : '')}>
            <input type='radio' name='kind' value={k} checked={kind === k} onChange={() => setKind(k)} required />
            <span>{label}</span>
            <small>{hint}</small>
          </label>
        ))}
      </div>
      <p className='att-hint'>Gold is the step still pending for this person.</p>

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
