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
        {items.map(([h, l]) => <Link key={h} href={h} role='menuitem' className={on(h) ? 'on' : ''}>{l}</Link>)}
      </span>
    </span>
  );
}

// Second header row: PettyTrack / AttendTrack / VisitTrack switch, the menu of the active module, and the
// admin links (Team, Logs, Guide) on the right.
export default function ModuleTier({ role, access = [], reviews = 0, approvals = 0 }) {
  const path = usePathname() || '/';
  const attend = path === '/attendance' || path.indexOf('/attendance/') === 0;
  const visit = path === '/visitors' || path.indexOf('/visitors/') === 0;
  const guard = role === 'guard';
  const om = role === 'om';

  const petty = [['/', 'Dashboard'], ['/expenses', 'Expenses'], ['/advances', 'Advances']];
  if (role !== 'so') petty.push(['/accounts', 'Accounts']);

  const att = [['/attendance', 'Add Entry'], ['/attendance/entries', 'Entries']];
  if (access.includes('att_view')) att.push(['/attendance/board', "Today's board"], ['/attendance/dashboard', 'Dashboard']);
  if (access.includes('att_logs')) att.push(['/attendance/logs', 'Day log']);
  if (access.includes('att_reports')) att.push(['/attendance/reports', 'Reports'], ['/attendance/analysis', 'Analysis']);
  if (role === 'om' || role === 'sso') att.push(['/attendance/hk-roster', 'Roster']);
  else att.push(['/attendance/hk-roster/request', 'Time Off Request']);
  if (access.includes('att_staff')) att.push(['/attendance/staff', 'Employees']);
  else {
    if (access.includes('att_import')) att.push(['/attendance/import', 'Import']);
    if (access.includes('att_reconcile')) att.push(['/attendance/reconcile', 'Reconciliation']);
  }

  const vis = [['/visitors', 'Visitor Entry']];
  if (access.includes('vis_log')) vis.push(['/visitors/log', 'Visitor Log']);
  const menu = visit ? vis : guard || attend ? att : petty;
  const admin = [];
  if (!guard) {
    if (om) admin.push(['/approvals', 'Approvals'], ['/team', 'Team'], ['/logs', 'Audit log']);
    admin.push(['/guide', 'Guide']);
  }

  // Exact match for the section home pages, prefix match for everything else.
  const on = (href) => (href === '/' || href === '/attendance' || href === '/visitors' ? path === href : path === href || path.indexOf(href + '/') === 0);

  return (
    <div className='tier'>
      <div className='tier-in'>
        <span className='modseg' translate='no'>
          {guard ? null : <Mod href='/' label='PettyTrack' active={!attend && !visit} items={petty} on={on} />}
          <Mod href='/attendance' label='AttendTrack' active={attend} items={att} on={on} />
          <Mod href='/visitors' label='VisitTrack' active={visit} items={vis} on={on} />
        </span>
        <span className='tier-sep' />
        <div className='tier-scroll'>
        <nav className='tier-menu'>
          {menu.map(([href, label]) => (
            <Link key={href} href={href} className={on(href) ? 'on' : ''}>{label}{(href === '/attendance/staff' || href === '/attendance/import') && reviews ? <span className='navbadge' title='Excel import days to review'>{reviews}</span> : null}</Link>
          ))}
        </nav>
        <span className='tier-sp' />
        <nav className='tier-menu admin'>
          {admin.map(([href, label]) => (
            <Link key={href} href={href} className={on(href) ? 'on' : ''}>{label}{href === '/approvals' && approvals ? <span className='navbadge' title='Waiting for your decision'>{approvals}</span> : null}</Link>
          ))}
        </nav>
        </div>
      </div>
    </div>
  );
}
