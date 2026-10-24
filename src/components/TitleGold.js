'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// The last word of each page title is gold, like the headlines on alphabold.com ("Visitor Entry", "Fuel Log").
// One-word titles stay as they are.
export default function TitleGold() {
  const path = usePathname();
  useEffect(() => {
    document.querySelectorAll('main.wrap .head h1').forEach((h) => {
      if (h.querySelector('.gw') || h.children.length || h.dataset.gw) return;
      const words = h.textContent.trim().split(/\s+/);
      if (words.length < 2) return;
      h.dataset.gw = '1';
      const last = words.pop();
      h.textContent = words.join(' ') + ' ';
      const s = document.createElement('span');
      s.className = 'gw';
      s.textContent = last;
      h.appendChild(s);
    });
  }, [path]);
  return null;
}
