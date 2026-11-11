import { GET as rosterXlsx } from '../../attendance/hk-roster/xlsx/route';

export const dynamic = 'force-dynamic';

// The Dastarkhawan roster as an Excel grid (the same download, always for the Dastarkhawan team).
export async function GET(req) {
  const u = new URL(req.url);
  u.searchParams.set('team', 'dast');
  return rosterXlsx(new Request(u, req));
}
