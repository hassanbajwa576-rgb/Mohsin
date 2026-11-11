import RosterPage from '../attendance/hk-roster/page';

export const dynamic = 'force-dynamic';

// The Dastarkhawan section: its roster (who is off, who is working today, at which sites).
export default function DastarkhawanRoster({ searchParams }) {
  return RosterPage({ searchParams, forceTeam: 'dast' });
}
