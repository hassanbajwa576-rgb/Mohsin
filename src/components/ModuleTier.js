'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// One module in the switch. Resting the mouse on it (or tabbing to it) drops its pages down;
// tapping it still opens the module, so phones behave as before.
function Mod({ href, label, active, items, on }) {
  return (
    <span className='modwrap'>
      <Link href={href} className={active ? 'on' : ''} aria-haspopup='true'>{label}</Link>
      <span className='modpop' role='menu' aria-label={label + ' pages'}>
        {items.map((it) => <Link key={it.href} href={it.href} role='menuitem' className={on(it.href) ? 'on' : ''}>{it.label}</Link>)}
      </span>
    </span>
  );
}

// A group of related pages in the menu row: clicking opens the first page, resting on it shows them all.
function Group({ label, href, items, on, badge }) {
  const active = items.some((it) => on(it.href));
  return (
    <span className='grpwrap'>
      <Link href={href} className={'grptab' + (active ? ' on' : '')} aria-haspopup='true'>{label}{badge}</Link>
      <span className='modpop grppop' role='menu' aria-label={label}>
        {items.map((it) => <Link key={it.href} href={it.href} role='menuitem' className={on(it.href) ? 'on' : ''}>{it.label}{it.badge}</Link>)}
      </span>
    </span>
  );
}

// Second header row: the PettyTrack / AttendTrack / VisitTrack switch and the pages of the module you are in.
export default function ModuleTier({ role, access = [], reviews = 0, approvals = 0 }) {
  const path = usePathname() || '/';
  const attend = path === '/attendance' || path.indexOf('/attendance/') === 0;
  const visit = path === '/visitors' || path.indexOf('/visitors/') === 0;
  const guard = role === 'guard';
  const om = role === 'om';
  const page = (href, label, badge) => ({ href, label, badge });
  // Several pages under one name. One page on its own stays a plain tab; none at all disappears.
  const group = (label, items, badge) => (items.length > 1 ? { label, items, href: items[0].href, badge } : items[0] || null);
  const mark = reviews ? <span className='navbadge' title='Excel import days to review'>{reviews}</span> : null;

  const petty = [page('/', 'Dashboard'), page('/expenses', 'Expenses'), page('/advances', 'Advances')];
  if (role !== 'so') petty.push(page('/accounts', 'Accounts'));

  const records = [page('/attendance/entries', 'Entries')];
  if (access.includes('att_logs')) records.push(page('/attendance/logs', 'Day log'));
  const live = [];
  if (access.includes('att_view')) live.push(page('/attendance/board', "Today's board"), page('/attendance/dashboard', 'Dashboard'));
  const reports = [];
  if (access.includes('att_reports')) reports.push(page('/attendance/reports', 'Reports'), page('/attendance/analysis', 'Analysis'));
  const manage = [];
  if (access.includes('att_staff')) manage.push(page('/attendance/staff', 'Employees', mark));
  manage.push(om || role === 'sso' ? page('/attendance/hk-roster', 'Roster') : page('/attendance/hk-roster/request', 'Time Off Request'));
  if (access.includes('att_import')) manage.push(page('/attendance/import', 'Import', mark));
  if (access.includes('att_reconcile')) manage.push(page('/attendance/reconcile', 'Reconciliation'));

  const att = [
    page('/attendance', 'Add Entry'),
    group('Records', records),
    group('Live', live),
    group('Reports', reports),
    group('Manage', manage, mark),
  ].filter(Boolean);

  const vis = [page('/visitors', 'Visitor Entry')];
  if (access.includes('vis_log')) vis.push(page('/visitors/log', 'Visitor Log'));

  const menu = visit ? vis : guard || attend ? att : petty;
  // Every page of a module, for the dropdown under its name.
  const all = (list) => list.flatMap((m) => (m.items ? m.items : [m]));
  const admin = [];
  if (!guard) {
    if (om) admin.push(page('/approvals', 'Approvals'), page('/team', 'Team'), page('/logs', 'Audit log'));
    admin.push(page('/guide', 'Guide'));
  }

  // Exact match for the section home pages, prefix match for everything else.
  const on = (href) => (href === '/' || href === '/attendance' || href === '/visitors' ? path === href : path === href || path.indexOf(href + '/') === 0);

  return (
    <div className='tier'>
      <div className='tier-in'>
        <span className='modseg' translate='no'>
          {guard ? null : <Mod href='/' label='PettyTrack' active={!attend && !visit} items={petty} on={on} />}
          <Mod href='/attendance' label='AttendTrack' active={attend} items={all(att)} on={on} />
          <Mod href='/visitors' label='VisitTrack' active={visit} items={vis} on={on} />
        </span>
        <span className='tier-sep' />
        <div className='tier-scroll'>
        <nav className='tier-menu'>
          {menu.map((m) => (m.items
            ? <Group key={m.label} label={m.label} href={m.href} items={m.items} on={on} badge={m.badge} />
            : <Link key={m.href} href={m.href} className={on(m.href) ? 'on' : ''}>{m.label}{m.badge}</Link>))}
        </nav>
        <span className='tier-sp' />
        <nav className='tier-menu admin'>
          {admin.map((m) => (
            <Link key={m.href} href={m.href} className={on(m.href) ? 'on' : ''}>{m.label}{m.href === '/approvals' && approvals ? <span className='navbadge' title='Waiting for your decision'>{approvals}</span> : null}</Link>
          ))}
        </nav>
        </div>
      </div>
    </div>
  );
}
