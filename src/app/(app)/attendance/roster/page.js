import { redirect } from 'next/navigation';

// The roster was renamed HK Roster; this keeps the old address working.
export default async function OldRosterRedirect({ searchParams }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp || {}).filter(([, v]) => typeof v === 'string')).toString();
  redirect('/attendance/hk-roster' + (q ? '?' + q : ''));
}