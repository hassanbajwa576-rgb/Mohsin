'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Second header row: PettyTrack / AttendTrack switch, the menu of the active module, and the
// admin links (Team, Logs, Guide) on the right.
export default function ModuleTier({ role, access = [], reviews = 0 }) {
  const path = usePathname() || '/';
  const attend = path === '/attendance' || path.indexOf('/attendance/') === 0;
  const guard = role === 'guard';
  const om = role === 'om';

  const petty = [['/', 'Dashboard'], ['/expenses', 'Expenses'], ['/advances', 'Advances']];
  if (role !== 'so') petty.push(['/accounts', 'Accounts']);

  const att = [['/attendance', 'Add Entry'], ['/attendance/entries', 'Entries']];
  if (access.includes('att_view')) att.push(['/attendance/board', "Today's board"], ['/attendance/dashboard', 'Dashboard']);
  if (access.includes('att_logs')) att.push(['/attendance/logs', 'Day log']);
  if (access.includes('att_reports')) att.push(['/attendance/reports', 'Reports'], ['/attendance/analysis', 'Analysis']);
  if (access.includes('att_staff')) att.push(['/attendance/staff', 'Employees']);
  else {
    if (access.includes('att_import')) att.push(['/attendance/import', 'Import']);
    if (access.includes('att_reconcile')) att.push(['/attendance/reconcile', 'Reconciliation']);
  }

  const menu = guard || attend ? att : petty;
  const admin = [];
  if (!guard) {
    if (om) admin.push(['/team', 'Team'], ['/logs', 'Audit log']);
    admin.push(['/guide', 'Guide']);
  }

  // Exact match for the section home pages, prefix match for everything else.
  const on = (href) => (href === '/' || href === '/attendance' ? path === href : path === href || path.indexOf(href + '/') === 0);

  return (
    <div className='tier'>
      <div className='tier-in'>
        {guard ? null : (
          <span className='modseg' translate='no'>
            <Link href='/' className={attend ? '' : 'on'}>PettyTrack</Link>
            <Link href='/attendance' className={attend ? 'on' : ''}>AttendTrack</Link>
          </span>
        )}
        {guard ? null : <span className='tier-sep' />}
        <div className='tier-scroll'>
        <nav className='tier-menu'>
          {menu.map(([href, label]) => (
            <Link key={href} href={href} className={on(href) ? 'on' : ''}>{label}{(href === '/attendance/staff' || href === '/attendance/import') && reviews ? <span className='navbadge' title='Excel import days to review'>{reviews}</span> : null}</Link>
          ))}
        </nav>
        <span className='tier-sp' />
        <nav className='tier-menu admin'>
          {admin.map(([href, label]) => (
            <Link key={href} href={href} className={on(href) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>
        </div>
      </div>
    </div>
  );
}
