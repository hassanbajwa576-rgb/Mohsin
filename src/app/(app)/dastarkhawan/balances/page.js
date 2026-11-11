import BalancesPage from '../../attendance/hk-roster/balances/page';

export const dynamic = 'force-dynamic';

// Dastarkhawan time-off balances for the year.
export default function DastarkhawanBalances({ searchParams }) {
  return BalancesPage({ searchParams, forceTeam: 'dast' });
}
