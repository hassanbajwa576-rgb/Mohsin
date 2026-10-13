import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { can } from '@/lib/perms';
import { addEntry, removeEntry } from '@/lib/att-actions';
import {
  ATT_ROLES, KIND_LABEL, STATE_LABEL, BREAK_LIMIT_MIN, canSeeTimes, activeStaff, recentEvents, groupByStaff,
  stateOf, sessionsOf, dutyContacts, fmtTime, fmtDur, todayKey, dateKey, editableEntries, conflictIds, inClass, outClass, timeClass, fmt12, fmtDay,
} from '@/lib/att';
import ConfirmButton from '@/components/ConfirmButton';
import EntryEdit from '@/components/EntryEdit';
import AttendanceEntryForm from '@/components/AttendanceEntryForm';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const SUGGEST = { off: 'in', on: 'out', break: 'break_in' };

export default async function AttendancePage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  const see = canSeeTimes(user);

  const staff = await activeStaff(user);
  const evs = await recentEvents(staff.map((x) => x.id), 3);
  const by = groupByStaff(evs);
  const now = Date.now();
  const rows = staff.map((x) => {
    const list = by.get(x.id) || [];
    return { ...x, list, ...stateOf(list) };
  });

  // Only labels and a suggested action reach the browser, never any entry times.
  const options = rows.map((r) => ({
    id: r.id,
    office: r.office,
    label: r.name,
    suggested: SUGGEST[r.state],
    status: STATE_LABEL[r.state],
  }));

  const contacts = await dutyContacts(user);

  // Entries this person may still fix: their own (the Sr. SO also those of the Support Officer and guards) for 36 hours.
  const fixable = await editableEntries(user);
  const bad = conflictIds(await recentEvents([...new Set(fixable.map((x) => x.staff_id))], 4));


  return (
    <>
      <div className='head'>
        <div>
          <h1>Attendance</h1>
          <p className='muted'>
            {see
              ? 'Both offices - record check in / check out and breaks, and see everyone\'s times below'
              : 'Pick the employee, the type of entry and the time, then add it. Entries are recorded for ' + user.office_code + '.'}
          </p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='card'>
        <h3>Add entry</h3>
        <AttendanceEntryForm options={options} action={addEntry} defaultOffice={user.office_code} />
      </div>

      {fixable.length > 0 ? (
        <div className='card'>
          <h3>{user.role === 'om' ? 'Entries from the last 36 hours' : 'Entries you can fix'}</h3>
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>Employee</th><th>Type</th><th>Time</th><th>Added by</th><th></th></tr>
              </thead>
              <tbody>
                {fixable.map((m) => {
                  const isBad = bad.has(m.id);
                  const canDelete = user.role === 'om' || user.role === 'sso';
                  return (
                    <tr key={m.id} className={isBad ? 'conflict' : ''}>
                      <td>
                        <OfficeTag o={m.office} /><b>{m.name}</b>
                        {isBad ? <div className='over-t'>Does not fit with the entries around it - please fix</div> : null}
                      </td>
                      <td>{KIND_LABEL[m.kind]}</td>
                      <td className={'nw ' + timeClass(m.kind, fmtTime(m.ms))}>{(dateKey(m.ms) === todayKey() ? '' : fmtDay(m.ms) + ', ') + fmt12(m.ms)}</td>
                      <td className='muted'>{m.by_name || '-'}</td>
                      <td className='act r'>
                        <div className='entry-act'>
                          <EntryEdit m={m} back='/attendance' />
                          {canDelete ? (
                            <form action={removeEntry} className='inline'>
                              <input type='hidden' name='id' value={m.id} />
                              <input type='hidden' name='back' value='/attendance' />
                              <ConfirmButton className='btn ghost' message='Delete this entry?'>Delete</ConfirmButton>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className='totals'>Green times are on time (check in by 9:30 AM, check out from 5:55 PM), red is late or early. Type, date and time can be changed for 36 hours after an entry was made.</p>
        </div>
      ) : null}

      {contacts.map((c) => (
        <div className='card' key={c.office}>
          <h3>{c.office} - Duty contacts</h3>
          <div className='contacts'>
            <Contact label='Morning Guard' list={c.morning} />
            <Contact label='Evening Guard' list={c.evening} />
            {c.team.map((t) => (
              <div className='contact' key={t.name + t.role}>
                <small>{t.role === 'om' ? 'Sr. Ops Manager' : t.role === 'sso' ? 'Sr. Support Officer' : 'Support Officer'}</small>
                <b>{t.name}</b><br />
                {t.phone ? <a href={'tel:' + t.phone}>{t.phone}</a> : <span className='muted'>No number</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Contact({ label, list }) {
  if (!list.length) {
    return <div className='contact'><small>{label}</small><span className='muted'>Not assigned</span></div>;
  }
  return list.map((g) => (
    <div className='contact' key={g.name}>
      <small>{label}</small>
      <b>{g.name}</b><br />
      {g.phone ? <a href={'tel:' + g.phone}>{g.phone}</a> : <span className='muted'>No number</span>}
    </div>
  ));
}
