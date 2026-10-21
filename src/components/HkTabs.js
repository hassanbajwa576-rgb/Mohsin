import Link from 'next/link';

// Roster | Balances | OPD | Setup: all are always shown, and the one you are on is highlighted.
const TABS = [['roster', 'Roster', '/attendance/hk-roster'], ['balances', 'Leave balances', '/attendance/hk-roster/balances'], ['opd', 'OPD', '/attendance/hk-roster/opd'], ['setup', 'Setup', '/attendance/hk-roster/setup']];
export default function HkTabs({ active }) {
  return (
    <div className='chips' style={{ marginBottom: 12 }}>
      {TABS.map(([k, label, href]) => <Link key={k} href={href} className={'chip' + (active === k ? ' on' : '')}>{label}</Link>)}
    </div>
  );
}