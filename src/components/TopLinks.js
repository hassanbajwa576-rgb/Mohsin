'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Manager links in the top bar (wide screens): Approvals (with its count), Team, Audit log and Guide.
// Phones keep the same links on the strip under the header.
export default function TopLinks({ role, approvals = 0, allowed = null, tasks = false }) {
  const path = usePathname() || '/';
  const on = (href) => path === href || path.indexOf(href + '/') === 0;
  const items = [];
  // Tasks sits right after ExpRev (same style, its own colour).
  if (role === 'om') items.push(['/exprev', 'ExpRev']);
  if (tasks) items.push(['/tasks', 'Tasks']);
  if (role === 'om') items.push(['/approvals', 'Approvals'], ['/team', 'Team'], ['/roles', 'Roles'], ['/logs', 'Audit log']);
  items.push(['/guide', 'Guide']);
  const shown = allowed ? items.filter(([href]) => allowed.includes(href)) : items;
  return (
    <nav className='toplinks' aria-label='Manager links'>
      {shown.map(([href, label]) => (
        <Link key={href} href={href} className={(on(href) ? 'on' : '') + (href === '/exprev' ? ' top-er' : href === '/tasks' ? ' top-tk' : '')}>
          {label}
          {href === '/approvals' && approvals ? <span className='navbadge' title='Waiting for your decision'>{approvals}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
