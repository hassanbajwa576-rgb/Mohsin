'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Manager links in the top bar (wide screens): the main buttons and Approvals (with its count) stay visible;
// Team, Roles, Audit log, Holidays and Guide sit in a "More" menu so the bar fits inside the page frame.
// Phones keep the same links on the strip under the header.
export default function TopLinks({ role, approvals = 0, allowed = null, tasks = false, dast = false }) {
  const path = usePathname() || '/';
  const on = (href) => path === href || path.indexOf(href + '/') === 0;
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const items = [];
  // Tasks sits right after ExpRev (same style, its own colour).
  if (role === 'om') items.push(['/exprev', 'ExpRev']);
  if (tasks) items.push(['/tasks', 'Tasks']);
  // The Dastarkhawan section sits right after Tasks (managed separately from the office pages).
  if (dast) items.push(['/dastarkhawan', 'Dastarkhawan']);
  if (role === 'om') items.push(['/approvals', 'Approvals'], ['/team', 'Team'], ['/roles', 'Roles'], ['/logs', 'Audit log'], ['/storage', 'Storage']);
  items.push(['/guide', 'Guide']);
  const picked = allowed ? items.filter(([href]) => allowed.includes(href)) : items;
  // The holiday calendar is open to everyone who can see the manager links.
  const extra = [['/holidays', 'Holidays']];
  const shown = [...picked.filter(([h]) => h !== '/guide'), ...extra, ...picked.filter(([h]) => h === '/guide')];
  // The Sr. Ops Manager has many links: the less used ones go under "More".
  const MORE = ['/team', '/roles', '/logs', '/storage', '/holidays', '/guide'];
  const fold = role === 'om';
  const main = fold ? shown.filter(([h]) => !MORE.includes(h)) : shown;
  const more = fold ? shown.filter(([h]) => MORE.includes(h)) : [];
  const link = ([href, label]) => (
    <Link key={href} href={href} className={(on(href) ? 'on' : '') + (href === '/exprev' ? ' top-er' : href === '/tasks' ? ' top-tk' : href === '/dastarkhawan' ? ' top-dk' : '')}>
      {label}
      {href === '/approvals' && approvals ? <span className='navbadge' title='Waiting for your decision'>{approvals}</span> : null}
    </Link>
  );
  return (
    <nav className='toplinks' aria-label='Manager links'>
      {main.map(link)}
      {more.length ? (
        <div className='tl-more' ref={box}>
          <button type='button' className={'tl-morebtn' + (more.some(([h]) => on(h)) ? ' on' : '')} aria-expanded={open} aria-haspopup='menu' onClick={() => setOpen(!open)}>
            More <span aria-hidden='true'>&#9662;</span>
          </button>
          {open ? <div className='tl-pop' role='menu'>{more.map(([href, label]) => <Link key={href} href={href} role='menuitem' className={on(href) ? 'on' : ''}>{label}</Link>)}</div> : null}
        </div>
      ) : null}
    </nav>
  );
}
