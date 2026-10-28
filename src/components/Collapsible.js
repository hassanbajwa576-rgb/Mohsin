'use client';

import { useEffect, useState } from 'react';

// A card that starts open on wide screens and closed on phones (filters, long forms).
export default function Collapsible({ title, children }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia('(max-width: 720px)').matches) setOpen(false);
  }, []);
  return (
    <details className='card er-collapse' open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><b>{title}</b></summary>
      {children}
    </details>
  );
}
