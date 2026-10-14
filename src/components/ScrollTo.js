'use client';

import { useEffect } from 'react';

// After a filter is applied the page reloads; bring the filter bar and its results back into view.
export default function ScrollTo({ id, when }) {
  useEffect(() => {
    if (!when) return;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' });
  }, [id, when]);
  return null;
}
