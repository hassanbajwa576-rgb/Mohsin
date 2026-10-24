'use client';

import { useEffect, useRef, useState } from 'react';

const fmt = (n, prefix) => prefix + Math.round(n).toLocaleString('en-US');

// A headline figure that counts up to its value when the page opens. The final figure is already in the page, so
// nothing is missing if the animation never runs (slow phone, reduced motion, printing).
export default function CountUp({ value, prefix = 'PKR ', ms = 900 }) {
  const end = Number(value) || 0;
  const [text, setText] = useState(fmt(end, prefix));
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !end) return undefined;
    ran.current = true;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setText(fmt(end * (1 - Math.pow(1 - p, 3)), prefix));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setText(fmt(0, prefix));
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, prefix, ms]);

  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</span>;
}