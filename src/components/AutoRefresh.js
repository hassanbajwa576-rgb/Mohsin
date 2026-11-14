'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Reloads the server data of the page every few seconds while the tab is open and visible, so a live board stays live.
export default function AutoRefresh({ seconds = 60 }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
