import Link from 'next/link';
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

      <p className='muted'>Made a mistake? Open the <Link href='/attendance/entries'>Entries</Link> tab to change or delete an entry.</p>

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
