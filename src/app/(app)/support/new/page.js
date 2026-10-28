import { requireUser } from '@/lib/auth';
import { SUPPORT_ROLES, allOffices, todayKey } from '@/lib/att';
import { CATS, PRIOS, WHO, DUE_DAYS } from '@/lib/support';
import SupportForm from '@/components/SupportForm';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function NewComplaintPage({ searchParams }) {
  const user = await requireUser(SUPPORT_ROLES);
  const sp = await searchParams;
  return (
    <>
      <div className='head'>
        <div>
          <h1>Record Complaint</h1>
          <p className='muted'>Write what happened, choose a category and priority, and add pictures if you have them. Mohsin and Imran are told straight away.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <SupportForm cats={CATS} prios={PRIOS} who={WHO} dueDays={DUE_DAYS} allOffices={allOffices(user)} office={user.office_code} today={todayKey()} />
      </div>
    </>
  );
}
