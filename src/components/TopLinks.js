'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Manager links in the top bar (wide screens): Approvals (with its count), Team, Audit log and Guide.
// Phones keep the same links on the strip under the header.
export default function TopLinks({ role, approvals = 0 }) {
  const path = usePathname() || '/';
  const on = (href) => path === href || path.indexOf(href + '/') === 0;
  const items = [];
  if (role === 'om') items.push(['/exprev', 'ExpRev'], ['/approvals', 'Approvals'], ['/team', 'Team'], ['/logs', 'Audit log']);
  items.push(['/guide', 'Guide']);
  return (
    <nav className='toplinks' aria-label='Manager links'>
      {items.map(([href, label]) => (
        <Link key={href} href={href} className={(on(href) ? 'on' : '') + (href === '/exprev' ? ' top-er' : '')}>
          {label}
          {href === '/approvals' && approvals ? <span className='navbadge' title='Waiting for your decision'>{approvals}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
