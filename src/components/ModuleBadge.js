'use client';

import { usePathname } from 'next/navigation';

// Shows which OpsTrack module the page belongs to.
export default function ModuleBadge() {
  const path = usePathname() || '';
  const attend = path === '/attendance' || path.indexOf('/attendance/') === 0;
  return <span translate='no' className={'module-badge' + (attend ? ' attend' : '')}>{attend ? 'AttendTrack' : 'PettyTrack'}</span>;
}
