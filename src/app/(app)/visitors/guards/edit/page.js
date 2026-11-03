import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { dutyOne, regularGuardNames } from '@/lib/guards';
import { saveGuardDuty } from '@/lib/guard-actions';
import GuardDutyForm from '@/components/GuardDutyForm';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function EditGuardDutyPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'guard_duty')) redirect('/visitors');
  const sp = await searchParams;
  const id = Number(sp.id);
  const [duty, names] = await Promise.all([dutyOne(Number.isInteger(id) ? id : 0), regularGuardNames()]);
  if (!duty) redirect('/visitors/guards');
  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit guard duty</h1>
          <p className='muted'>Changes to the name, mobile, CNIC or card number apply to this temporary guard everywhere. Every change is recorded in the Logs.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <GuardDutyForm action={saveGuardDuty} duty={duty} names={names} today={todayKey()} label='Save changes' />
      </div>
    </>
  );
}
