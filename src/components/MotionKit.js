'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Scroll motion in the style of alphabold.com, for the whole app:
//  - boxes that start below the fold stay hidden and ease up when you scroll to them
//  - key figures (KPI boxes, fuel card balances, step counts) count up when they come into view
// Everything is left exactly as it is for people who ask their device for less motion.
const BOXES = 'main.wrap > .card, main.wrap > .kpis > *, main.wrap > .fuelcards > *, main.wrap > .pipe > *, main.wrap > .funds > *';
const FIGURES = 'main.wrap .kpi b, main.wrap .fuelcard .fbal, main.wrap .pipe .c';
// The PettyTrack dashboard and Accounts keep their figures in tables and fund boxes, so count those too (only on those pages).
const MONEY_PAGES = ['/', '/accounts'];
const MONEY_FIGURES = 'main.wrap td b, main.wrap .fund b, main.wrap .fund-h b, main.wrap .step .s';
const NUM = /^(PKR\s*)?(-?[\d,]+)$/;

export default function MotionKit() {
  const path = usePathname();
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const raf = [];
    const seen = new IntersectionObserver((list) => {
      list.forEach((en) => {
        if (!en.isIntersecting) return;
        seen.unobserve(en.target);
        if (en.target.dataset.mkCount) count(en.target);
        else en.target.classList.add('rv-in');
      });
    }, { threshold: 0.12 });

    const count = (el) => {
      const m = NUM.exec(el.dataset.mkCount);
      const end = Number(m[2].replace(/,/g, ''));
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / 1000);
        el.textContent = (m[1] || '') + Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US');
        if (p < 1) raf.push(requestAnimationFrame(step));
        else el.textContent = el.dataset.mkCount;
      };
      raf.push(requestAnimationFrame(step));
    };

    const timer = setTimeout(() => {
      document.querySelectorAll(BOXES).forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight - 40) {
          el.classList.add('rv');
          seen.observe(el);
        }
      });
      document.querySelectorAll(MONEY_PAGES.includes(path) ? FIGURES + ', ' + MONEY_FIGURES : FIGURES).forEach((el) => {
        const t = el.textContent.trim();
        if (el.children.length || !NUM.test(t) || t === '0' || el.dataset.mkCount) return;
        el.dataset.mkCount = t;
        seen.observe(el);
      });
    }, 60);
    return () => {
      clearTimeout(timer);
      seen.disconnect();
      raf.forEach(cancelAnimationFrame);
    };
  }, [path]);
  return null;
}
