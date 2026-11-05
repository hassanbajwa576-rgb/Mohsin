'use client';
import { useState } from 'react';

// Pick the look of the sliding navigation: gold pill or light beam. Saved in a cookie, applied at once.
const OPTIONS = [['pill', 'Gold pill'], ['beam', 'Light beam']];

export default function NavStyle({ initial = 'pill' }) {
  const [mode, setMode] = useState(initial);
  const pick = (m) => {
    setMode(m);
    if (m === 'beam') document.documentElement.dataset.nav = 'beam';
    else delete document.documentElement.dataset.nav;
    document.cookie = 'pt_nav=' + m + '; path=/; max-age=31536000; samesite=lax';
  };
  return (
    <div className='themepick navpick' role='group' aria-label='Navigation style'>
      {OPTIONS.map(([m, label]) => (
        <button key={m} type='button' aria-pressed={mode === m} onClick={() => pick(m)}><i className={m === 'beam' ? 'beam' : ''} />{label}</button>
      ))}
    </div>
  );
}
