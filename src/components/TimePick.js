'use client';

import { useEffect, useRef, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

// '14:05' -> { digits: '205', pm: true }
function split(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
  if (!m) return { digits: '', pm: new Date().getHours() >= 12 };
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { digits: String(h12) + m[2], pm: h >= 12 };
}

// What was typed -> hour, minute and the meridiem it implies, or null while it is not a time yet.
function read(digits, pm) {
  if (!digits) return null;
  let h;
  let m;
  if (digits.length <= 2) {
    h = Number(digits);
    m = 0;
  } else {
    h = Number(digits.slice(0, digits.length - 2));
    m = Number(digits.slice(-2));
  }
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

const shown = (d) => (d.length > 2 ? d.slice(0, d.length - 2) + ':' + d.slice(-2) : d);

// Time entry with the phone's number pad. Only the Sr. Ops Manager gets it; everyone else keeps the native time field.
export default function TimePick({ role, name, defaultValue = '', required = false, className = '', chips = false }) {
  if (role !== 'om') return <input type='time' name={name} defaultValue={defaultValue} required={required} className={className || undefined} />;
  return <Pad name={name} defaultValue={defaultValue} required={required} className={className} chips={chips} />;
}

function Pad({ name, defaultValue, required, className, chips }) {
  const start = split(defaultValue);
  const [digits, setDigits] = useState(defaultValue ? start.digits : '');
  const [pm, setPm] = useState(start.pm);
  const box = useRef(null);
  const t = read(digits, pm);
  const effPm = t ? t.pm : pm;
  const value = t ? pad((t.h % 12) + (effPm ? 12 : 0)) + ':' + pad(t.m) : '';
  const bad = digits !== '' && !t;

  useEffect(() => {
    if (!box.current) return;
    box.current.setCustomValidity(bad ? 'Enter a time such as 10:30' : '');
  }, [bad, digits]);

  const set = (h24, m) => {
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    setDigits(String(h12) + pad(m));
    setPm(h24 >= 12);
  };
  const plus = (mins) => {
    const d = new Date(Date.now() + mins * 60000);
    set(d.getHours(), d.getMinutes());
  };

  return (
    <span className={'tp ' + className}>
      <span className='tp-row'>
        <input
          ref={box}
          type='text'
          inputMode='numeric'
          autoComplete='off'
          placeholder='10:30'
          value={shown(digits)}
          required={required}
          maxLength={5}
          aria-label='Time'
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
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
