'use client';

import { useEffect, useRef } from 'react';

// "Add a task" sits next to the page title as a small button. Clicking it opens the form just below; it closes again after saving,
// when you press Escape or click elsewhere, so the page keeps its full width.
export default function TaskAddPanel({ title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => {
      const d = ref.current;
      if (d && d.open && !d.contains(e.target)) d.open = false;
    };
    const esc = (e) => {
      if (e.key === 'Escape' && ref.current) ref.current.open = false;
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, []);
  const closeSoon = () => setTimeout(() => { if (ref.current) ref.current.open = false; }, 100);
  return (
    <details className='tkaddbtn' ref={ref}>
      <summary>{title}</summary>
      <div className='tkpop' onSubmit={closeSoon}>{children}</div>
    </details>
  );
}
