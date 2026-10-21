'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Notification bell: shows the unread count and pops a toast when a new message arrives.
export default function Bell({ initial }) {
  const [count, setCount] = useState(initial);
  const [toast, setToast] = useState(null);
  const prev = useRef(initial);
  const seen = useRef(false);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const r = await fetch('/api/notifications', { cache: 'no-store' });
        if (!r.ok || stop) return;
        const j = await r.json();
        if (seen.current && j.unread > prev.current && j.latest) setToast(j.latest);
        seen.current = true;
        prev.current = j.unread;
        setCount(j.unread);
        try {
          if ('setAppBadge' in navigator) {
            if (j.unread > 0) navigator.setAppBadge(j.unread);
            else if ('clearAppBadge' in navigator) navigator.clearAppBadge();
          }
        } catch {
          // the badge is a nicety
        }
      } catch {
        // network hiccup - try again on the next tick
      }
    }
    tick();
    const t = setInterval(tick, 15000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <>
      <Link href='/notifications' className='bell' aria-label='Notifications'>
        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
          <path d='M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' />
          <path d='M13.7 21a2 2 0 0 1-3.4 0' />
        </svg>
        {count > 0 ? <span className='dot'>{count > 99 ? '99+' : count}</span> : null}
      </Link>
      {toast ? (
        <Link href={toast.link || '/notifications'} className='toast' onClick={() => setToast(null)}>
          <b>New</b> {toast.message}
        </Link>
      ) : null}
    </>
  );
}
