'use client';

import { useEffect, useRef, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

// '14:05' -> { hh: '2', mm: '05', pm: true }
function split(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
  if (!m) return { hh: '', mm: '', pm: new Date().getHours() >= 12 };
  const h = Number(m[1]);
  return { hh: String(h % 12 === 0 ? 12 : h % 12), mm: m[2], pm: h >= 12 };
}

// Hour and minute as typed -> hour (1-12), minute and the meridiem they imply, or null while not a time yet.
function read(hh, mm, pm) {
  if (!hh) return null;
  let h = Number(hh);
  const m = mm === '' ? 0 : Number(mm);
  if (m > 59 || h > 23) return null;
  let isPm = pm;
  if (h === 0) {
    h = 12;
    isPm = false;
  } else if (h > 12) {
    h -= 12;
    isPm = true;
  }
  return { h, m, pm: isPm };
}

// Time entry with the phone's number pad. Only the Sr. Ops Manager gets it; everyone else keeps the native time field.
export default function TimePick({ role, name, defaultValue = '', required = false, className = '', chips = false }) {
  if (role !== 'om') return <input type='time' name={name} defaultValue={defaultValue} required={required} className={className || undefined} />;
  return <Pad name={name} defaultValue={defaultValue} required={required} className={className} chips={chips} />;
}

// Tap the hour, type it, and the cursor moves to the minutes by itself; the number pad stays open.
function Pad({ name, defaultValue, required, className, chips }) {
  const start = split(defaultValue);
  const [hh, setHh] = useState(start.hh);
  const [mm, setMm] = useState(start.mm);
  const [pm, setPm] = useState(start.pm);
  const hRef = useRef(null);
  const mRef = useRef(null);
  const t = read(hh, mm, pm);
  const effPm = t ? t.pm : pm;
  const value = t ? pad((t.h % 12) + (effPm ? 12 : 0)) + ':' + pad(t.m) : '';
  const bad = (hh !== '' || mm !== '') && !t;

  useEffect(() => {
    if (hRef.current) hRef.current.setCustomValidity(bad ? 'Enter a time such as 10:30' : '');
  }, [bad, hh, mm]);

  const pick = (e) => {
    const el = e.target;
    setTimeout(() => el.select(), 0);
  };
  const set = (h24, m) => {
    setHh(String(h24 % 12 === 0 ? 12 : h24 % 12));
    setMm(pad(m));
    setPm(h24 >= 12);
  };
  const plus = (mins) => {
    const d = new Date(Date.now() + mins * 60000);
    set(d.getHours(), d.getMinutes());
  };
  const onHour = (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 2);
    setHh(d);
    if (d.length === 2 || (d.length === 1 && Number(d) >= 2)) {
      if (mRef.current) {
        mRef.current.focus();
        mRef.current.select();
      }
    }
  };
  const onMin = (e) => {
    let d = e.target.value.replace(/\D/g, '').slice(0, 2);
    if (d.length === 1 && Number(d) >= 6) d = '0' + d;
    setMm(d);
  };
  const backFromMin = (e) => {
    if (e.key === 'Backspace' && mm === '' && hRef.current) {
      hRef.current.focus();
      hRef.current.select();
    }
  };

  return (
    <span className={'tp ' + className}>
      <span className='tp-row'>
        <span className='tp-time'>
          <input ref={hRef} type='text' inputMode='numeric' autoComplete='off' placeholder='HH' maxLength={2} value={hh} required={required} aria-label='Hour' onFocus={pick} onChange={onHour} />
          <b aria-hidden='true'>:</b>
          <input ref={mRef} type='text' inputMode='numeric' autoComplete='off' placeholder='MM' maxLength={2} value={mm} aria-label='Minutes' onFocus={pick} onChange={onMin} onKeyDown={backFromMin} onBlur={() => { if (hh && mm.length === 1) setMm('0' + mm); }} />
        </span>
        <span className='tp-ap' role='group' aria-label='AM or PM'>
          <button type='button' className={effPm ? '' : 'on'} onClick={() => setPm(false)}>AM</button>
          <button type='button' className={effPm ? 'on' : ''} onClick={() => setPm(true)}>PM</button>
        </span>
      </span>
      {chips ? (
        <span className='tp-chips'>
          <button type='button' onClick={() => plus(0)}>Now</button>
          <button type='button' onClick={() => plus(15)}>+15 min</button>
          <button type='button' onClick={() => plus(30)}>+30 min</button>
        </span>
      ) : null}
      {bad ? <span className='tp-err'>Enter a time such as 10:30</span> : null}
      <input type='hidden' name={name} value={value} />
    </span>
  );
}
