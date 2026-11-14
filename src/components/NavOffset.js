'use client';

import { useEffect } from 'react';

// Keeps --navh equal to the height of the top bar, so sticky table headings sit just under it while the page scrolls.
// The bar can change height after the page first shows (menu, fonts, window size), so it is measured again whenever it changes.
export default function NavOffset() {
  useEffect(() => {
    const n = document.querySelector('.nav');
    const set = () => {
      const h = n ? Math.ceil(n.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--navh', h + 'px');
    };
    set();
    window.addEventListener('resize', set);
    window.addEventListener('load', set);
    let ro = null;
    if (n && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(set);
      ro.observe(n);
    }
    const t = setTimeout(set, 600);
    return () => {
      window.removeEventListener('resize', set);
      window.removeEventListener('load', set);
      if (ro) ro.disconnect();
      clearTimeout(t);
    };
  }, []);
  return null;
}
