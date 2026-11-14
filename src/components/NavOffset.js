'use client';

import { useEffect } from 'react';

// Keeps --navh equal to the height of the top bar, so sticky table headings sit just under it while the page scrolls.
export default function NavOffset() {
  useEffect(() => {
    const set = () => {
      const n = document.querySelector('.nav');
      document.documentElement.style.setProperty('--navh', (n ? n.offsetHeight : 0) + 'px');
    };
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);
  return null;
}
