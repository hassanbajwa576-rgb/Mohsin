import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { hkPeople, dkToday, dkUnlinked, dkLinked, siteList } from '@/lib/roster';
import { syncDk, dkStatus } from '@/lib/dk-sync';
import DkPanel from '@/components/DkPanel';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Dastarkhawan Today's board: who has checked in today (facial attendance app), and the links between people and the facial app.
export default async function DastarkhawanToday({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const sp = await searchParams;
  const edit = can(user, 'dast_edit');
  const today = todayKey();
  await syncDk();
  const status = await dkStatus();
  const rows = await dkToday(today);
  const team = await hkPeople({ team: 'dast' });
  const allSites = await siteList();
  const unlinked = edit ? await dkUnlinked() : { people: [], staff: [] };
  const linked = edit ? await dkLinked() : [];

  return (
    <>
      <div className='head'>
        <div>
          <h1>Today's board</h1>
          <p className='muted'>Who of the Dastarkhawan team has checked in today, with the time they came and whether they are still on site.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <DkPanel rows={rows} team={team} allSites={allSites} teamSize={team.length} status={status} unlinked={unlinked} linked={linked} edit={edit} />
    </>
  );
}
