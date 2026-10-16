import Link from 'next/link';
import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { removeEntry } from '@/lib/att-actions';
import {
  ATT_ROLES, KIND_LABEL, editableEntries, conflictIds, recentEvents, timeClass, fmtTime, fmt12, fmtDay, dateKey, todayKey,
} from '@/lib/att';
import ConfirmButton from '@/components/ConfirmButton';
import EntryEdit from '@/components/EntryEdit';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Entries this person may still change or delete: their own (the Sr. SO also those of the Support
// Officer and guards) for 36 hours after they were made. The Sr. OM can change any entry from Logs.
export default async function EntriesPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  const list = await editableEntries(user);
  const bad = conflictIds(await recentEvents([...new Set(list.map((x) => x.staff_id))], 4));
  const all = sp.all === '1';
  const shown = all ? list : list.slice(0, 10);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Entries</h1>
          <p className='muted'>Change or delete an entry you made, within 36 hours of making it.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        {list.length === 0 ? (
          <p className='muted'>No entries to change in the last 36 hours.</p>
        ) : (
          <>
            <div className='tablewrap'>
              <table className='shift'>
                <thead>
                  <tr><th>Employee</th><th>Type</th><th>Time</th><th>Added by</th><th></th></tr>
                </thead>
                <tbody>
                  {shown.map((m) => {
                    const isBad = bad.has(m.id);
                    return (
                      <tr key={m.id} className={isBad ? 'conflict' : ''}>
                        <td className='c-name'>
                          <OfficeTag o={m.office} /><b>{m.name}</b>
                          {isBad ? <div className='over-t'>Does not fit with the entries around it - please fix</div> : null}
                        </td>
                        <td className='c-tile'>{KIND_LABEL[m.kind]}</td>
                        <td className={'nw c-tile ' + timeClass(m.kind, fmtTime(m.ms))}>{(dateKey(m.ms) === todayKey() ? '' : fmtDay(m.ms) + ', ') + fmt12(m.ms)}</td>
                        <td className='c-tile wide'>{m.by_name || '-'}</td>
                        <td className='act r'>
                          <div className='entry-act'>
                            <EntryEdit m={m} back='/attendance/entries' />
                            <form action={removeEntry} className='inline'>
                              <input type='hidden' name='id' value={m.id} />
                              <input type='hidden' name='back' value='/attendance/entries' />
                              <ConfirmButton className='btn ghost' message='Delete this entry?'>Delete</ConfirmButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length > 10 ? (
              <p className='totals'>{all ? 'Showing all ' + list.length : 'Showing the latest 10 of ' + list.length} - <Link href={all ? '/attendance/entries' : '/attendance/entries?all=1'}>{all ? 'Show fewer' : 'See more'}</Link></p>
            ) : null}
            <p className='totals'>Green times are on time (check in by 9:30 AM, check out from 5:55 PM), red is late or early.</p>
          </>
        )}
      </div>
    </>
  );
}
