import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { todayKey } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import ImportExcel from '@/components/ImportExcel';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Last week (Monday to Sunday) is the usual thing to fill in.
function lastWeek(today) {
  const d = new Date(today + 'T00:00:00Z');
  const mon = addDay(today, -(((d.getUTCDay() + 6) % 7) + 7));
  return [mon, addDay(mon, 6)];
}

export default async function ImportPage({ searchParams }) {
  const user = await requireUser(['om']);
  if (user.role !== 'om') redirect('/attendance');
  const sp = await searchParams;
  const [from, to] = lastWeek(todayKey());
  return (
    <>
      <div className='head'>
        <div>
          <h1>Import from Excel</h1>
          <p className='muted'>Fill in missing days from the weekly attendance sheet and the guard's break timing sheet. You review everything before anything is saved.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <ImportExcel from={from} to={to} />
    </>
  );
}
