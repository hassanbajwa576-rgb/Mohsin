'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ALL_PAGES, pageOf } from '@/lib/pages';

// For someone whose pages were picked on the Team page: a page that is not on their list sends them to the first one that is.
export default function PageGuard({ allowed }) {
  const path = usePathname() || '/';
  const router = useRouter();
  const key = pageOf(path);
  const blocked = !!key && !allowed.includes(key);
  useEffect(() => {
    if (blocked) router.replace(ALL_PAGES.find((h) => allowed.includes(h)) || '/profile');
  }, [blocked, allowed, router]);
  return blocked ? <div className='pg-block'>Opening a page you can use...</div> : null;
}
