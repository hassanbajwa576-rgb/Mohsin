'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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

// A group of related pages in the menu row. With a mouse it opens when you rest on it;
// on a phone you tap it and the pages appear on the strip below.
function Group({ label, items, on, badge, open, toggle }) {
  const active = items.some((it) => on(it.href));
  return (
    <span className={'grpwrap' + (open ? ' open' : '')}>
      <button type='button' className={'grptab' + (active ? ' on' : '')} aria-expanded={open} aria-haspopup='true' onClick={() => toggle(label)}>
        {label}{badge}
      </button>
      <span className='modpop grppop' role='menu' aria-label={label}>
        {items.map((it) => <Link key={it.href} href={it.href} role='menuitem' className={on(it.href) ? 'on' : ''}>{it.label}{it.badge}</Link>)}
      </span>
    </span>
  );
}

// Second header row: the PettyTrack / AttendTrack / VisitTrack switch and the pages of the module you are in.
export default function ModuleTier({ role, access = [], reviews = 0, approvals = 0, allowed = null }) {
  const path = usePathname() || '/';
  const [open, setOpen] = useState('');
  const bar = useRef(null);
  // The open group closes when the page changes or when you tap anywhere else.
  useEffect(() => setOpen(''), [path]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (bar.current && !bar.current.contains(e.target)) setOpen('');
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const toggle = (label) => setOpen((v) => (v === label ? '' : label));

  const attend = path === '/attendance' || path.indexOf('/attendance/') === 0;
  const visit = path === '/visitors' || path.indexOf('/visitors/') === 0;
  const fuel = path === '/fuel' || path.indexOf('/fuel/') === 0;
  const sup = path === '/support' || path.indexOf('/support/') === 0;
  const exr = path === '/exprev' || path.indexOf('/exprev/') === 0;
  const guard = role === 'guard';
  const om = role === 'om';
  const sso = role === 'sso';
  const page = (href, label, badge) => ({ href, label, badge });
  // Several pages under one name. One page on its own stays a plain tab; none at all disappears.
  const group = (label, items, badge) => (items.length > 1 ? { label, items, badge } : items[0] || null);
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
  if (!guard) manage.push(om || role === 'sso' ? page('/attendance/hk-roster', 'Roster') : page('/attendance/hk-roster/request', 'Time Off Request'));
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

  const fu = [page('/fuel', 'Fuel Entry'), page('/fuel/log', 'Fuel Log')];
  if (om) fu.push(page('/fuel/setup', 'Setup'));
  const su = [page('/support', 'Dashboard'), page('/support/new', 'Record Complaint'), page('/support/list', 'All Complaints')];
  if (om || role === 'sso') su.push(page('/support/people', 'By Person'));
  const er = [page('/exprev', 'Dashboard'), page('/exprev/entries', 'Expenditures'), page('/exprev/budget', 'Budget vs Actual'), page('/exprev/analysis', 'Analysis'), page('/exprev/import', 'Import')];
  // Pages picked for this person on the Team page: everything else is left out of the bars and menus.
  const ok = (href) => !allowed || allowed.includes(href);
  const keep = (list) => list.map((m) => (m && m.items ? { ...m, items: m.items.filter((i) => ok(i.href)) } : m)).filter((m) => m && (m.items ? m.items.length > 0 : ok(m.href)));
  const pettyK = keep(petty);
  const attK = keep(att);
  const visK = keep(vis);
  const fuK = keep(fu);
  const suK = keep(su);
  const erK = keep(er);
  const menu = exr ? erK : sup ? suK : fuel ? fuK : visit ? visK : guard || attend ? attK : pettyK;
  // Every page of a module, for the dropdown under its name.
  const all = (list) => list.flatMap((m) => (m.items ? m.items : [m]));
  const admin = [];
  if (!guard) {
    if (om) admin.push(page('/exprev', 'ExpRev'), page('/approvals', 'Approvals'), page('/team', 'Team'), page('/logs', 'Audit log'));
    admin.push(page('/guide', 'Guide'));
  }
  const adminK = admin.filter((m) => ok(m.href));
  const opened = menu.find((m) => m.items && m.label === open);

  // Exact match for the section home pages, prefix match for everything else.
  const on = (href) => (href === '/' || href === '/attendance' || href === '/visitors' || href === '/fuel' || href === '/support' || href === '/exprev' ? path === href : path === href || path.indexOf(href + '/') === 0);

  // Phone only, Sr. Ops Manager only: the module switch moves to a bottom bar with icons.
  const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true };
  const bots = [];
  if (pettyK.length) bots.push({ href: '/', label: 'Petty', active: !attend && !visit && !fuel && !sup && !exr, d: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 14h2' });
  if (attK.length) bots.push({ href: '/attendance', label: 'Attendance', active: attend, d: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' });
  if (visK.length) bots.push({ href: '/visitors', label: 'Visitors', active: visit, d: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2.5 3 5' });
  if (access.includes('fuel_use') && fuK.length) bots.push({ href: '/fuel', label: 'Fuel', active: fuel, d: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z' });
  if (suK.length) bots.push({ href: '/support', label: 'Support', active: sup, d: 'M4 5h16v11H9l-5 4zM8 10h8' });
  if (om && erK.length) bots.push({ href: '/exprev', label: 'ExpRev', active: exr, d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' });

  return (
    <div className={'tier' + (om || sso ? ' tier-om' : '')} ref={bar}>
      <div className='tier-in'>
        <span className='modseg' translate='no'>
          {guard || !pettyK.length ? null : <Mod href='/' label='Petty' active={!attend && !visit && !fuel && !sup && !exr} items={pettyK} on={on} />}
          {attK.length ? <Mod href='/attendance' label='Attendance' active={attend} items={all(attK)} on={on} /> : null}
          {visK.length ? <Mod href='/visitors' label='Visitors' active={visit} items={visK} on={on} /> : null}
          {access.includes('fuel_use') && fuK.length ? <Mod href='/fuel' label='Fuel' active={fuel} items={fuK} on={on} /> : null}
          {guard || !suK.length ? null : <Mod href='/support' label='Support' active={sup} items={suK} on={on} />}
        </span>
        <span className='tier-sep' />
        <div className='tier-scroll'>
        <nav className='tier-menu'>
          {menu.map((m) => (m.items
            ? <Group key={m.label} label={m.label} items={m.items} on={on} badge={m.badge} open={open === m.label} toggle={toggle} />
            : <Link key={m.href} href={m.href} className={(on(m.href) ? 'on' : '') + (m.href === '/exprev/import' ? ' hide-m' : '')}>{m.label}{m.badge}</Link>))}
        </nav>
        <span className='tier-sp' />
        <nav className='tier-menu admin'>
          {adminK.map((m) => (
            <Link key={m.href} href={m.href} className={on(m.href) ? 'on' : ''}>{m.label}{m.href === '/approvals' && approvals ? <span className='navbadge' title='Waiting for your decision'>{approvals}</span> : null}</Link>
          ))}
        </nav>
        </div>
      </div>
      {opened ? (
        <nav className='subrow' aria-label={opened.label}>
          {opened.items.map((it) => <Link key={it.href} href={it.href} className={(on(it.href) ? 'on' : '') + (it.href === '/exprev/import' ? ' hide-m' : '')}>{it.label}{it.badge}</Link>)}
        </nav>
      ) : null}
      {om || sso ? (
        <nav className='botbar' aria-label='Modules' translate='no'>
          {bots.map((b) => (
            <Link key={b.href} href={b.href} className={b.active ? 'on' : ''}>
              <svg {...ic}><path d={b.d} /></svg>
              <span>{b.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
