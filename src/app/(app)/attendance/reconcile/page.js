import Link from 'next/link';
import { redirect } from 'next/navigation';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { todayKey, validDate } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import { scan } from '@/lib/att-reconcile';
import { markReviewedForm } from '@/lib/att-actions';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  ['long', 'Shifts over 16 hours', 'Usually a mixed up AM and PM. Fix the time in the Day log, or mark it reviewed if it is right.'],
  ['noout', 'Check in with no check out', 'Fine for staff who do not need a check out (for example on Saturdays). Mark those as reviewed.'],
  ['misfit', "Entries that do not fit together", "For example two check ins in a row, or a break that never ended. Fix them in the Day log."],
];

export default async function ReconcilePage({ searchParams }) {
  const user = await requireUser(['om']);
  if (user.role !== 'om') redirect('/attendance');
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  const from = validDate(sp.from || '') ? sp.from : addDay(to, -29);
  const run = !!sp.run;
  const found = run ? await scan(from, to) : null;
  const left = await q("SELECT COUNT(*)::int AS n FROM pc2_import_review WHERE resolved_at IS NULL AND kind = 'conflict'");
  const back = '/attendance/reconcile?run=1&from=' + from + '&to=' + to;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Reconciliation</h1>
          <p className='muted'>Looks through the attendance already in the app and lists whatever still needs a look. Items you mark as reviewed do not come up again.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <form method='get' className='card filters'>
        <input type='hidden' name='run' value='1' />
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        <button className='btn primary' type='submit'>Run reconciliation</button>
      </form>

      {left[0].n ? (
        <div className='card'>
          <b>{left[0].n} day{left[0].n > 1 ? 's' : ''} from an Excel import still need a decision.</b>{' '}
          <Link href='/attendance/import'>Open the import review list</Link>
        </div>
      ) : null}

      {found ? (
        <>
          <p className='muted'>
            {from} to {to}: {found.long.length + found.noout.length + found.misfit.length} to review
            {found.hidden ? ', ' + found.hidden + ' already marked as reviewed' : ''}.
          </p>
          {SECTIONS.map(([k, title, note]) => {
            const list = found[k];
            return (
              <div className='card' key={k}>
                <h3 style={{ marginTop: 0 }}>{title} ({list.length})</h3>
                <p className='muted'>{note}</p>
                {list.length ? (
                  <>
                    <div className='tablewrap'>
                      <table className='tx'>
                        <thead><tr><th>Employee</th><th>Date</th><th>What</th><th></th></tr></thead>
                        <tbody>
                          {list.slice(0, 300).map((it) => (
                            <tr key={it.staff + it.day + it.sig}>
                              <td className='c-title'><OfficeTag o={it.office} /><b>{it.name}</b></td>
                              <td className='nw c-meta'>{it.day}</td>
                              <td className='c-meta'>{it.text}</td>
                              <td className='act'>
                                <Link className='btn' href={'/attendance/logs?date=' + it.day + '&emp=' + encodeURIComponent(it.name)}>Open in Day log</Link>
                                <form action={markReviewedForm} className='inline'>
                                  <input type='hidden' name='items' value={JSON.stringify([{ staff: it.staff, day: it.day, kind: it.kind, sig: it.sig }])} />
                                  <input type='hidden' name='back' value={back} />
                                  <button className='btn primary' type='submit'>Mark reviewed</button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <form action={markReviewedForm} style={{ marginTop: 10 }}>
                      <input type='hidden' name='items' value={JSON.stringify(list.slice(0, 300).map((it) => ({ staff: it.staff, day: it.day, kind: it.kind, sig: it.sig })))} />
                      <input type='hidden' name='back' value={back} />
                      <button className='btn' type='submit'>Mark all {Math.min(list.length, 300)} shown as reviewed</button>
                    </form>
                  </>
                ) : <p className='muted'>Nothing to review here.</p>}
              </div>
            );
          })}
        </>
      ) : null}
    </>
  );
}
