'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AttTabs({ tabs }) {
  const path = usePathname();
  return (
    <div className='chips att-tabs'>
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} className={'chip' + (path === href ? ' on' : '')}>{label}</Link>
      ))}
    </div>
  );
}
