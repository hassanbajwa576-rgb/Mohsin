import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { guardSummary, dutyRows, regularGuardNames, prunePhotos, SHIFTS, PHOTO_KINDS, PHOTO_KEEP_DAYS } from '@/lib/guards';
import { saveGuardDuty, deleteGuardDuty } from '@/lib/guard-actions';
import GuardDutyForm from '@/components/GuardDutyForm';
import ConfirmButton from '@/components/ConfirmButton';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const KIND = Object.fromEntries(PHOTO_KINDS);
const photoLinks = (photos) => (photos || []).map((p) => (
  <a key={p.id} href={'/visitors/guards/photo?pid=' + p.id} target='_blank' rel='noreferrer' className='btn'>{KIND[p.kind] || 'Picture'}</a>
));
const span = (a, b) => (a === b ? a : a + ' to ' + b);

export default async function GuardDutyPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'guard_duty')) redirect('/visitors');
  const sp = await searchParams;
  await prunePhotos();
  const [people, duties, names] = await Promise.all([guardSummary(), dutyRows(100), regularGuardNames()]);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Guard Duty</h1>
          <p className='muted'>When a new guard comes in place of a regular guard, record who he is, whose duty he is doing and until when. It keeps a record of who was on duty and how many days each temporary guard has worked.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <details className='card' open>
        <summary>Add a temporary guard</summary>
        <GuardDutyForm action={saveGuardDuty} names={names} today={todayKey()} />
        <p className='muted'>Someone already on file is recognised by their CNIC, so their days are added to the same record.</p>
      </details>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Temporary guards</h3>
        {people.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Name</th><th>Mobile</th><th>CNIC</th><th>Card no.</th><th className='r'>Worked</th><th>Duty dates</th><th>Pictures</th></tr></thead>
              <tbody>
                {people.map((g) => (
                  <tr key={g.id}>
                    <td className='c-title'><b>{g.name}</b></td>
                    <td className='nw c-meta hide-m'>{g.mobile}</td>
                    <td className='nw c-meta hide-m'>{g.cnic}</td>
                    <td className='c-meta hide-m'>{g.card_no || '-'}</td>
                    <td className='r nw c-amt'><b>{g.days} {g.days === 1 ? 'day' : 'days'}</b><div className='sub'>{g.shifts} {g.shifts === 1 ? 'shift' : 'shifts'}</div></td>
                    <td className='nw c-meta hide-m'>{g.first_on ? span(g.first_on, g.last_on) : '-'}</td>
                    <td className='show-m'>
                      <div>{g.mobile}{g.card_no ? ' · Card ' + g.card_no : ''}</div>
                      <div className='sub'>CNIC {g.cnic}{g.first_on ? ' · ' + span(g.first_on, g.last_on) : ''}</div>
                    </td>
                    <td className='act'>{photoLinks(g.photos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No temporary guards recorded yet.</p>}
        <p className='muted'>Pictures are deleted automatically {PHOTO_KEEP_DAYS} days after a temporary guard's last duty. The name, CNIC and duty history stay.</p>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Duty entries</h3>
        {duties.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Duty</th><th>Guard</th><th>Shift</th><th>In place of</th><th>Entered by</th><th className='r'>Days</th><th></th></tr></thead>
              <tbody>
                {duties.map((d) => (
                  <tr key={d.id}>
                    <td className='nw c-meta hide-m'>{span(d.duty_from, d.duty_to)}</td>
                    <td className='c-title'><b>{d.name}</b>{d.note ? <div className='muted'>{d.note}</div> : null}</td>
                    <td className='c-meta hide-m'>{SHIFTS[d.shift]}</td>
                    <td className='c-meta hide-m'>{d.taken_over_from || '-'}</td>
                    <td className='c-meta hide-m'>{d.entered_by || '-'}</td>
                    <td className='r nw c-amt'><b>{d.days} {d.days === 1 ? 'day' : 'days'}</b></td>
                    <td className='show-m'>
                      <div>{span(d.duty_from, d.duty_to)} &middot; {SHIFTS[d.shift]}</div>
                      <div className='sub'>{d.taken_over_from ? 'In place of ' + d.taken_over_from : ''}</div>
                    </td>
                    <td className='act'>
                      <Link className='btn' href={'/visitors/guards/edit?id=' + d.id}>Edit</Link>
                      {user.role === 'om' ? (
                        <form action={deleteGuardDuty} className='inline'>
                          <input type='hidden' name='id' value={d.id} />
                          <ConfirmButton className='btn ghost' message='Remove this duty entry?'>Remove</ConfirmButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No duty entries yet.</p>}
      </div>
    </>
  );
}
