'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

// The layout switches the number pad on for the Sr. Ops Manager; everyone else keeps the native time field.
const Numpad = createContext(false);
export function NumpadProvider({ on, children }) {
  return <Numpad.Provider value={!!on}>{children}</Numpad.Provider>;
}

// '14:05' -> { hh: '2', mm: '05', pm: true }
function split(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(v || '');
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

// A time field. Uncontrolled (name, defaultValue) or controlled (value, onChange with 'HH:MM'). Value is always 24 hour 'HH:MM'.
export default function TimePick({ role, name, defaultValue = '', value, onChange, required = false, disabled = false, className = '', chips = false }) {
  const on = useContext(Numpad) || role === 'om';
  if (!on) {
    const props = value !== undefined ? { value, onChange: (e) => onChange && onChange(e.target.value) } : { defaultValue };
    return <input type='time' name={name} required={required} disabled={disabled} className={className || undefined} {...props} />;
  }
  return <Pad name={name} defaultValue={defaultValue} value={value} onChange={onChange} required={required} disabled={disabled} className={className} chips={chips} />;
}

// Tap the hour, type it, and the cursor moves to the minutes by itself; the number pad stays open.
function Pad({ name, defaultValue, value, onChange, required, disabled, className, chips }) {
  const controlled = value !== undefined;
  const start = split(controlled ? value : defaultValue);
  const [hh, setHh] = useState(controlled ? (value ? start.hh : '') : defaultValue ? start.hh : '');
  const [mm, setMm] = useState(controlled ? (value ? start.mm : '') : defaultValue ? start.mm : '');
  const [pm, setPm] = useState(start.pm);
  const hRef = useRef(null);
  const mRef = useRef(null);
  const dirty = useRef(false);
  const sent = useRef(controlled ? value : '');
  const t = read(hh, mm, pm);
  const effPm = t ? t.pm : pm;
  const out = t ? pad((t.h % 12) + (effPm ? 12 : 0)) + ':' + pad(t.m) : '';
  const bad = (hh !== '' || mm !== '') && !t;

  useEffect(() => {
    if (hRef.current) hRef.current.setCustomValidity(bad ? 'Enter a time such as 10:30' : '');
  }, [bad, hh, mm]);

  // The parent changed the value (for example "Use current time"): show it.
  useEffect(() => {
    if (!controlled || value === sent.current) return;
    sent.current = value;
    const s = split(value);
    setHh(value ? s.hh : '');
    setMm(value ? s.mm : '');
    if (value) setPm(s.pm);
  }, [value, controlled]);

  // What was typed: tell the parent.
  useEffect(() => {
    if (!controlled || !dirty.current) return;
    dirty.current = false;
    if (out !== sent.current) {
      sent.current = out;
      if (onChange) onChange(out);
    }
  });

  const touch = () => {
    dirty.current = true;
  };
  const pick = (e) => {
    const el = e.target;
    setTimeout(() => el.select(), 0);
  };
  const set = (h24, m) => {
    touch();
    setHh(String(h24 % 12 === 0 ? 12 : h24 % 12));
    setMm(pad(m));
    setPm(h24 >= 12);
  };
  const plus = (mins) => {
    const d = new Date(Date.now() + mins * 60000);
    set(d.getHours(), d.getMinutes());
  };
  const onHour = (e) => {
    touch();
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
    touch();
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
  const ampm = (v) => {
    touch();
    setPm(v);
  };

  return (
    <span className={'tp ' + className}>
      <span className='tp-row'>
        <span className='tp-time'>
          <input ref={hRef} type='text' inputMode='numeric' autoComplete='off' placeholder='HH' maxLength={2} value={hh} required={required} disabled={disabled} aria-label='Hour' onFocus={pick} onChange={onHour} />
          <b aria-hidden='true'>:</b>
          <input ref={mRef} type='text' inputMode='numeric' autoComplete='off' placeholder='MM' maxLength={2} value={mm} disabled={disabled} aria-label='Minutes' onFocus={pick} onChange={onMin} onKeyDown={backFromMin} onBlur={() => { if (hh && mm.length === 1) { touch(); setMm('0' + mm); } }} />
          <span className='tp-ap' role='group' aria-label='AM or PM'>
            <button type='button' disabled={disabled} className={effPm ? '' : 'on'} onClick={() => ampm(false)}>AM</button>
            <button type='button' disabled={disabled} className={effPm ? 'on' : ''} onClick={() => ampm(true)}>PM</button>
          </span>
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
      {name ? <input type='hidden' name={name} value={out} /> : null}
    </span>
  );
}
