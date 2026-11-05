'use client';
import { useEffect, useState } from 'react';

// Light, Dark (black with gold) or Auto (follows the phone/computer). Saved in a cookie so the server can paint the right theme at once.
const ORDER = ['light', 'dark', 'auto'];
const LABEL = { light: 'Light', dark: 'Dark', auto: 'Auto' };

function apply(mode) {
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.cookie = 'pt_theme=' + mode + '; path=/; max-age=31536000; samesite=lax';
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', dark ? '#0a0a0a' : '#e3ad21');
}

function Icon({ mode }) {
  if (mode === 'dark') return <svg viewBox='0 0 24 24'><path d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' /></svg>;
  if (mode === 'auto') return <svg viewBox='0 0 24 24'><circle cx='12' cy='12' r='8' /><path d='M12 4v16' /><path d='M12 4a8 8 0 0 1 0 16z' fill='currentColor' /></svg>;
  return <svg viewBox='0 0 24 24'><circle cx='12' cy='12' r='4' /><path d='M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19' /></svg>;
}

export default function ThemeToggle({ initial = 'light', variant = 'icon' }) {
  const [mode, setMode] = useState(initial);
  useEffect(() => {
    if (mode !== 'auto') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => apply('auto');
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [mode]);
  const pick = (m) => { setMode(m); apply(m); };
  if (variant === 'pick') {
    const cls = { light: 'l', dark: 'd', auto: 'a' };
    return (
      <div className='themepick' role='group' aria-label='Theme'>
        {ORDER.map((m) => (
          <button key={m} type='button' aria-pressed={mode === m} onClick={() => pick(m)}><i className={cls[m]} />{m === 'dark' ? 'Dark (black and gold)' : LABEL[m]}</button>
        ))}
      </div>
    );
  }
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return (
    <button type='button' className='themebtn' onClick={() => pick(next)} title={'Theme: ' + LABEL[mode] + ' (tap for ' + LABEL[next] + ')'} aria-label={'Theme: ' + LABEL[mode] + '. Switch to ' + LABEL[next]}>
      <Icon mode={mode} />
    </button>
  );
}
