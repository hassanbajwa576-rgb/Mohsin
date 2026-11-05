'use client';

import { useEffect, useRef } from 'react';

// The "Add a task" panel: open on wide screens (it sits at the top right), folded away on phones so the list is not pushed down.
export default function TaskAddPanel({ title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.innerWidth < 900) ref.current.open = false;
  }, []);
  return (
    <details className='card tkadd' open ref={ref}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}
