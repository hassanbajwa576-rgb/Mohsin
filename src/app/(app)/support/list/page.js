import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices } from '@/lib/att';
import { CATS, PRIOS, complaintRows, remindOverdue } from '@/lib/support';
import ComplaintTable from '@/components/ComplaintTable';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Every complaint the person may see, with filters.
export default async function ComplaintListPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  await remindOverdue();
  const status = ['open', 'resolved', 'overdue'].includes(sp.status) ? sp.status : '';
  const priority = PRIOS.some(([k]) => k === sp.priority) ? sp.priority : '';
  const category = CATS.some(([k]) => k === sp.category) ? sp.category : '';
  const office = allOffices(user) && ['LHR', 'ISB'].includes(sp.office) ? sp.office : '';
  const text = String(sp.q || '').trim().slice(0, 60);
  const rows = await complaintRows(user, { status, priority, category, office, text });
  return (
    <>
      <div className='head'>
        <div>
          <h1>All Complaints</h1>
          <p className='muted'>Open complaints come first, most urgent on top.</p>
        </div>
        <Link href='/support/new' className='btn primary'>Record a complaint</Link>
      </div>
      <Flash sp={sp} />
      <form method='get' className='card filters'>
        <label>Status
          <select name='status' defaultValue={status}><option value=''>All</option><option value='open'>Open</option><option value='overdue'>Overdue</option><option value='resolved'>Resolved</option></select>
        </label>
        <label>Priority
          <select name='priority' defaultValue={priority}><option value=''>All</option>{PRIOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>Category
          <select name='category' defaultValue={category}><option value=''>All</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        {allOffices(user) ? (
          <label>Office
            <select name='office' defaultValue={office}><option value=''>Both</option><option>LHR</option><option>ISB</option></select>
          </label>
        ) : null}
        <label>Search<input name='q' defaultValue={text} placeholder='Title, SC number, place or name' /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/support/list' className='btn ghost'>Reset</Link>
      </form>
      <div className='card'>
        <h3>Complaints ({rows.length})</h3>
        <ComplaintTable rows={rows} empty='No complaints for these filters.' />
      </div>
    </>
  );
}
