import Link from 'next/link';

// Support team: Roster | Time-off Balance | OPD | Setup.
// The Dastarkhawan team has its own section (/dastarkhawan) with its own menu, so no tab bar is drawn for it here.
const TABS = [['roster', 'Roster', '/attendance/hk-roster'], ['balances', 'Time-off Balance', '/attendance/hk-roster/balances'], ['opd', 'OPD', '/attendance/hk-roster/opd'], ['setup', 'Setup', '/attendance/hk-roster/setup']];
export default function HkTabs({ active, team = 'support' }) {
  if (team === 'dast') return null;
  return (
    <div className='chips' style={{ marginBottom: 12 }}>
      {TABS.map(([k, label, href]) => <Link key={k} href={href} className={'chip' + (active === k ? ' on' : '')}>{label}</Link>)}
    </div>
  );
}
