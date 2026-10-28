'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Which stage a visitor is in: 15 minutes before, 5 minutes before, due, or late.
const stage = (ms) => (ms < -10 * 60000 ? 'late' : ms <= 0 ? 'due' : ms <= 5 * 60000 ? 'five' : ms <= 15 * 60000 ? 'fifteen' : '');

function beep() {
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    const ctx = new A();
    [0, 0.25].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.2;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.18);
    });
  } catch {
    /* sound can be blocked until the screen is touched */
  }
}

// Guard screen: a banner for every visitor due within 15 minutes, with a countdown, a buzz and a beep when a new stage starts.
export default function ExpectedAlert({ items = [] }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    const r = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 60000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [router]);

  const rows = items
    .map((v) => ({ ...v, left: Number(v.due_ms) - now }))
    .map((v) => ({ ...v, st: stage(v.left) }))
    .filter((v) => v.st)
    .sort((a, b) => a.left - b.left);

  // Buzz and beep once per visitor per stage; what is already showing when the page opens stays quiet.
  useEffect(() => {
    const keys = new Set(rows.map((v) => v.id + ':' + v.st));
    if (seen.current === null) {
      seen.current = keys;
      return;
    }
    let fresh = false;
    keys.forEach((k) => {
      if (!seen.current.has(k)) fresh = true;
    });
    seen.current = keys;
    if (fresh) {
      try {
        if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
      } catch {
        /* not every phone can buzz */
      }
      beep();
    }
  });

  if (!rows.length) return null;
  const mins = (ms) => Math.max(1, Math.ceil(Math.abs(ms) / 60000));
  const text = (v) => (v.st === 'late' ? 'Late by ' + mins(v.left) + ' min' : v.st === 'due' ? 'Due now' : 'Arriving in ' + mins(v.left) + ' min');

  return (
    <div className='ealert' role='alert'>
      {rows.map((v) => (
        <div key={v.id} className={'ea ea-' + v.st}>
          <b>{text(v)}</b>
          <span>{v.name}{v.company ? ' (' + v.company + ')' : ''}{v.host ? ', meeting ' + v.host : ''}</span>
        </div>
      ))}
    </div>
  );
}
