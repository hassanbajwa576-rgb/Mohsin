import Link from 'next/link';

// First row: which team (Support or Dastarkhawan). Second row: Roster | Time-off Balance | OPD | Setup.
// OPD and Setup belong to the Support team; the Dastarkhawan team shows Roster, Time-off Balance and Sites (where its sites are added and removed).
const TABS = [['roster', 'Roster', '/attendance/hk-roster'], ['balances', 'Time-off Balance', '/attendance/hk-roster/balances'], ['opd', 'OPD', '/attendance/hk-roster/opd'], ['setup', 'Setup', '/attendance/hk-roster/setup']];
export default function HkTabs({ active, team = 'support' }) {
  const dast = team === 'dast';
  const tabs = dast ? [...TABS.filter((t) => t[0] === 'roster' || t[0] === 'balances'), ['sites', 'Sites', '/attendance/hk-roster/sites']] : TABS;
  const q = dast ? '?team=dast' : '';
  return (
    <>
      <div className='chips' style={{ marginBottom: 8 }} aria-label='Team'>
        <Link href='/attendance/hk-roster' className={'chip' + (dast ? '' : ' on')}>Support</Link>
        <Link href='/attendance/hk-roster?team=dast' className={'chip' + (dast ? ' on' : '')}>Dastarkhawan</Link>
      </div>
      <div className='chips' style={{ marginBottom: 12 }}>
        {tabs.map(([k, label, href]) => <Link key={k} href={href + q} className={'chip' + (active === k ? ' on' : '')}>{label}</Link>)}
      </div>
    </>
  );
}
