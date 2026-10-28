'use client';

import { useEffect, useRef, useState } from 'react';
import TimePick from '@/components/TimePick';

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
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const hh = (parts.find((x) => x.type === 'hour') || {}).value || '00';
  const mi = (parts.find((x) => x.type === 'minute') || {}).value || '00';
  const time = (hh === '24' ? '00' : hh) + ':' + mi;
  return { date, time };
}

export default function AttendanceEntryForm({ options, action, defaultOffice, workOffices }) {
  const offices = workOffices && workOffices.length ? workOffices : [...new Set(options.map((o) => o.office))];
  const [visiting, setVisiting] = useState(false);
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
  const [touched, setTouched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [small, setSmall] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [vp, setVp] = useState({ h: 0, t: 0 });
  const recRef = useRef(null);
  const edited = useRef(false);
  const sheetIn = useRef(null);

  useEffect(() => {
    const n = nowPk();
    setDate(n.date);
    setTime(n.time);
    // Voice search needs the browser speech service (Chrome, Edge, Android; limited on iPhone).
    // The microphone is offered on phones and tablets only; laptops and desktops type the name.
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const touchFirst = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || !!(navigator.userAgentData && navigator.userAgentData.mobile);
    setCanListen(supported && (mobileUa || touchFirst));
    // A phone keeps the page open for hours: when it comes back to the front, show today's date and time again unless they were changed by hand.
    const fresh = () => {
      if (document.visibilityState === 'hidden' || edited.current) return;
      const p = nowPk();
      setDate(p.date);
      setTime(p.time);
    };
    document.addEventListener('visibilitychange', fresh);
    window.addEventListener('pageshow', fresh);
    window.addEventListener('focus', fresh);
    return () => {
      document.removeEventListener('visibilitychange', fresh);
      window.removeEventListener('pageshow', fresh);
      window.removeEventListener('focus', fresh);
    };
  }, []);

  // Employees of the chosen office, narrowed by what has been typed.
  // 'Visiting' also lists the employees of the other office; the entry is then recorded and counted at the office chosen above.
  const inOffice = options
    .filter((o) => o.office === office || visiting)
    .map((o) => (o.office === office ? o : { ...o, label: o.label + ' (' + o.office + ')' }));
  // For Check In, people who are already checked in (on duty or on a break) are left out unless "show everyone" is tapped.
  const checkedIn = (o) => o.status === 'On duty' || o.status === 'On break';
  const hiddenCount = kind === 'in' ? inOffice.filter(checkedIn).length : 0;
  const pool = kind === 'in' && !showAll ? inOffice.filter((o) => !checkedIn(o) || String(o.id) === picked) : inOffice;
  const q = text.trim().toLowerCase();
  const words = q.split(' ').filter(Boolean);
  let found = q ? pool.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))) : pool;
  if (q && found.length === 0 && words.length > 1) {
    found = pool.filter((o) => words.some((w) => o.label.toLowerCase().includes(w)));
  }
  // The whole list is available (scrolls); typing only narrows it down.
  const matches = found;
  // A single remaining match counts as chosen, so typing "zub" is enough.
  const effectiveId = picked || (q && matches.length === 1 ? String(matches[0].id) : '');
  const chosen = options.find((o) => String(o.id) === effectiveId);

  // Suggest the most likely next entry for the chosen employee.
  // (Only until the entry type has been tapped by hand, so a deliberate choice is never overridden.)
  useEffect(() => {
    if (chosen && !touched) setKind(chosen.suggested);
  }, [effectiveId]);

  // Phones: the employee list opens as a full-screen picker pinned above the keyboard, so nothing needs scrolling.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const on = () => setSmall(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (!sheet) return undefined;
    const v = window.visualViewport;
    const sync = () => setVp({ h: v ? v.height : window.innerHeight, t: v ? v.offsetTop : 0 });
    sync();
    if (v) {
      v.addEventListener('resize', sync);
      v.addEventListener('scroll', sync);
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      if (v) {
        v.removeEventListener('resize', sync);
        v.removeEventListener('scroll', sync);
      }
      document.body.style.overflow = prev;
    };
  }, [sheet]);
  function openSheet(focus) {
    if (picked) {
      setPicked('');
      setText('');
    }
    setSheet(true);
    if (focus) setTimeout(() => sheetIn.current && sheetIn.current.focus(), 60);
  }

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
    setSheet(false);
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
      else if (e.error === 'network') setErr('Voice search could not reach the speech service. Check the internet connection and try again, or type the name.');
      else if (e.error === 'audio-capture') setErr('No microphone was found on this device. Type the name instead.');
      else if (e.error === 'language-not-supported') setErr('This browser does not support voice search in this language. Type the name instead.');
      else setErr('Voice search is not available right now (' + (e.error || 'unknown') + '). Type the name instead.');
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setErr('');
    setPicked('');
    setText('');
    setOpen(true);
    if (small) setSheet(true);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  // Fill the date and time with the current Pakistan time at the moment of the click.
  function fillNow(e) {
    if (e && e.preventDefault) e.preventDefault();
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

      <input type='hidden' name='at_office' value={office} />
      <div className='att-field'>
        <label className='att-visit'>
          <input type='checkbox' checked={visiting} onChange={(e) => { setVisiting(e.target.checked); setPicked(''); setText(''); }} /> Include employees from the other office (visiting {office})
        </label>
      </div>

      <div className='att-field'>
        <span className='att-lbl'>Entry</span>
        <div className='att-seg' role='radiogroup' aria-label='Entry type'>
          {KINDS.map(([k, label, hint]) => (
            <label key={k} className={(kind === k ? 'on' : '') + ((chosen ? chosen.suggested : 'in') === k ? ' pend' : '')}>
              <input type='radio' name='kind' value={k} checked={kind === k} onChange={() => { setKind(k); setTouched(true); }} required />
              <span>{label}</span>
              <small>{hint}</small>
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
          readOnly={small}
          onFocus={() => { if (small) openSheet(true); else setOpen(true); }}
          onClick={() => { if (small && !sheet) openSheet(true); }}
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
        {!small && open && (matches.length > 0 || hiddenCount > 0) ? (
          <ul className='att-list' role='listbox'>
            {matches.map((o) => (
              <li key={o.id}>
                <button type='button' onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label}<small className='att-st'>{o.status}</small></button>
              </li>
            ))}
            {hiddenCount > 0 ? (
              <li className='att-note'>
                {showAll ? 'Showing everyone, including ' + hiddenCount + ' already checked in. ' : hiddenCount + ' already checked in ' + (hiddenCount === 1 ? 'is' : 'are') + ' hidden. '}
                <button type='button' onMouseDown={(e) => e.preventDefault()} onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide them' : 'Show everyone'}</button>
              </li>
            ) : null}
          </ul>
        ) : null}
        {!small && open && q && matches.length === 0 ? <p className='att-none'>No employee in {office} matches that name</p> : null}
      </div>

      {sheet ? (
        <div className='att-sheet' style={{ top: vp.t, height: vp.h || '100%' }} role='dialog' aria-label='Choose employee'>
          <div className='att-sheet-head'>
            <b>Employee - {office}</b>
            <button type='button' className='btn ghost' onClick={() => setSheet(false)}>Close</button>
          </div>
          <div className='att-sheet-in'>
            <div className='att-inputrow'>
              <input
                ref={sheetIn}
                type='text'
                value={text}
                placeholder={listening ? 'Listening... say the name' : 'Type a name'}
                autoComplete='off'
                onChange={(e) => {
                  setText(e.target.value);
                  setPicked('');
                  setErr('');
                }}
              />
              {canListen ? (
                <button
                  type='button'
                  className={'att-mic' + (listening ? ' on' : '')}
                  onClick={listen}
                  aria-label={listening ? 'Stop listening' : 'Say the employee name'}
                >
                  <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                    <rect x='9' y='3' width='6' height='11' rx='3' />
                    <path d='M5 11a7 7 0 0 0 14 0' />
                    <path d='M12 18v3' />
                  </svg>
                </button>
              ) : null}
            </div>
            {err ? <p className='att-err' style={{ margin: '6px 0 0' }}>{err}</p> : null}
          </div>
          <ul className='att-sheet-list'>
            {matches.map((o) => (
              <li key={o.id}>
                <button type='button' onClick={() => pick(o)}>{o.label}<small>{o.status}</small></button>
              </li>
            ))}
            {matches.length === 0 ? <li className='att-note'>No employee in {office} matches that name</li> : null}
            {hiddenCount > 0 ? (
              <li className='att-note'>
                {showAll ? 'Showing everyone, including ' + hiddenCount + ' already checked in. ' : hiddenCount + ' already checked in ' + (hiddenCount === 1 ? 'is' : 'are') + ' hidden. '}
                <button type='button' onClick={() => setShowAll(!showAll)}>{showAll ? 'Hide them' : 'Show everyone'}</button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {chosen ? (
        <p className='att-hint'><b>{chosen.label}</b> is {String(chosen.status || '').toLowerCase()}. Usual next step: <b>{(KINDS.find((x) => x[0] === chosen.suggested) || [])[1]}</b> (gold).</p>
      ) : null}

      <div className='att-when'>
        <label>Date<input type='date' name='date' value={date} onChange={(e) => { edited.current = true; setDate(e.target.value); }} required /></label>
        <label>Time<TimePick name='time' value={time} onChange={(v) => { edited.current = true; setTime(v); }} required /></label>
        <button type='button' className='btn ghost' onClick={fillNow}>Use current time</button>
      </div>

      {err ? <p className='att-err'>{err}</p> : null}
      <button className='btn primary att-submit' type='submit'>Add entry</button>
    </form>
  );
}
