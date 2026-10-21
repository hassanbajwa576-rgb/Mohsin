import Link from 'next/link';

// Roster | OPD: both are always shown, and the one you are on is highlighted.
export default function HkTabs({ active }) {
  return (
    <div className='chips' style={{ marginBottom: 12 }}>
      <Link href='/attendance/hk-roster' className={'chip' + (active === 'roster' ? ' on' : '')}>Roster</Link>
      <Link href='/attendance/hk-roster/opd' className={'chip' + (active === 'opd' ? ' on' : '')}>OPD</Link>
    </div>
  );
}