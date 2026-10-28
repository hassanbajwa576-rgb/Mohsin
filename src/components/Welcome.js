'use client';

import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';

const KEY = 'ot-welcome';

// Opening screen: shown once each time the app is opened (until the browser or installed app is closed), then Continue goes in.
export default function Welcome({ name, role }) {
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const btn = useRef(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) setGone(true);
    } catch {
      /* private mode: show it each time */
    }
    if (btn.current) btn.current.focus({ preventScroll: true });
  }, []);

  const go = () => {
    try {
      sessionStorage.setItem(KEY, '1');
      document.documentElement.classList.add('ot-seen');
    } catch {
      /* ignore */
    }
    setLeaving(true);
    setTimeout(() => setGone(true), 320);
  };

  if (gone) return null;
  return (
    <div className={'welcome' + (leaving ? ' leaving' : '')} role='dialog' aria-label='Welcome to OpsTrack'>
      <div className='welcome-in'>
        <Logo height={72} />
        <div className='welcome-brand'>Ops<span>Track</span></div>
        <div className='welcome-hi'>Welcome back, {name}</div>
        <div className='welcome-role'>{role}</div>
        <button ref={btn} type='button' className='btn primary welcome-go' onClick={go}>Continue</button>
      </div>
      <div className='welcome-foot'>Powered by <b>Ops</b> | AlphaBOLD</div>
    </div>
  );
}
