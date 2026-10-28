'use client';

import { useEffect } from 'react';

// After a form reloads the page, bring the section it belongs to into view.
export default function JumpTo({ id, when }) {
  useEffect(() => {
    if (!when) return undefined;
    const go = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ block: 'start' });
    };
    go();
    const t = setTimeout(go, 250);
    return () => clearTimeout(t);
  }, [id, when]);
  return null;
}
