import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES } from '@/lib/att';
import { byPerson, isMgr } from '@/lib/support';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// Mohsin and Imran: how many complaints were tagged to each person, so repeats are easy to spot.
export default async function ComplaintsByPersonPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!isMgr(user)) redirect('/support');
  const sp = await searchParams;
  const rows = await byPerson();
  return (
    <>
      <div className='head'>
        <div>
          <h1>Complaints By Person</h1>
          <p className='muted'>Complaints that were tagged to someone as responsible for the floor, the area or the work.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <h3>Tagged People ({rows.length})</h3>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Person</th><th>Group</th><th className='r'>Total</th><th className='r'>Cleaning</th><th className='r'>Still open</th><th className='r'>Resolved</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.kind + r.name}>
                    <td className='c-title'><b>{r.name}</b></td>
                    <td className='c-meta'>{r.kind}</td>
                    <td className='r nw'><b>{r.total}</b></td>
                    <td className='r nw c-meta'>{r.cleaning}</td>
                    <td className='r nw c-meta'>{r.open}</td>
                    <td className='r nw c-meta'>{r.done}</td>
                    <td className='act'><Link className='btn ghost' href={'/support/list?q=' + encodeURIComponent(r.name)}>See complaints</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No complaint has been tagged to anyone yet. Open a complaint and use Tag responsible person.</p>}
      </div>
    </>
  );
}
