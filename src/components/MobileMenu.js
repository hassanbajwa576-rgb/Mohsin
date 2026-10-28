'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Phones: Approvals, Team, Audit log and Guide sit behind one Menu button instead of a row of their own.
export default function MobileMenu({ role, approvals = 0, allowed = null }) {
  const ref = useRef(null);
  const path = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);
  const items = [];
  if (role === 'om') items.push(['/approvals', 'Approvals'], ['/team', 'Team'], ['/logs', 'Audit log']);
  items.push(['/guide', 'Guide']);
  const shown = allowed ? items.filter(([href]) => allowed.includes(href)) : items;
  if (!shown.length) return null;
  return (
    <details className='mmenu' ref={ref}>
      <summary className='btn ghost'>Menu{approvals ? <span className='navbadge'>{approvals}</span> : null}</summary>
      <div className='mmenu-panel'>
        {shown.map(([href, label]) => (
          <Link key={href} href={href}>{label}{href === '/approvals' && approvals ? <span className='navbadge'>{approvals}</span> : null}</Link>
        ))}
      </div>
    </details>
  );
}
