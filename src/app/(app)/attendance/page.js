import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { can } from '@/lib/perms';
import { addEntry, removeEntry } from '@/lib/att-actions';
import {
  ATT_ROLES, KIND_LABEL, STATE_LABEL, BREAK_LIMIT_MIN, canSeeTimes, activeStaff, recentEvents, groupByStaff,
  stateOf, sessionsOf, dutyContacts, fmtTime, fmtDur, todayKey, dateKey, editableEntries, conflictIds, inClass, outClass, timeClass,
} from '@/lib/att';
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
  }));

  const contacts = await dutyContacts(user);

  // Entries this person may still fix: their own (the Sr. SO also those of the Support Officer and guards) for 36 hours.
  const fixable = await editableEntries(user);
  const bad = conflictIds(await recentEvents([...new Set(fixable.map((x) => x.staff_id))], 4));

  const today = todayKey();
  const board = see
    ? rows.map((r) => {
        const ss = sessionsOf(r.list, now).filter((x) => dateKey(x.start) === today);
        const over = r.state === 'break' && now - r.since > BREAK_LIMIT_MIN * 60000;
        return {
          ...r,
          over,
          worked: ss.reduce((a, x) => a + x.workedMs, 0),
          breakMs: ss.reduce((a, x) => a + x.breakMs, 0),
          breaks: ss.reduce((a, x) => a + x.breakCount, 0),
          inAt: ss.length ? ss[0].start : null,
          outAt: ss.length && ss[ss.length - 1].end ? ss[ss.length - 1].end : null,
        };
      })
    : [];
  const on = board.filter((r) => r.state === 'on').length;
  const br = board.filter((r) => r.state === 'break').length;
  const over = board.filter((r) => r.over).length;

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
              <tbody>
                {fixable.map((m) => {
                  const tm = fmtTime(m.ms);
                  const isBad = bad.has(m.id);
                  const canUndo = m.fresh && (user.role === 'om' || (user.role !== 'sso' && m.entered_by === user.id));
                  return (
                    <tr key={m.id} className={isBad ? 'conflict' : ''}>
                      <td>
                        <OfficeTag o={m.office} /><b>{m.name}</b>
                        {isBad ? <div className='over-t'>Does not fit with the entries around it - please fix</div> : null}
                      </td>
                      <td>{KIND_LABEL[m.kind]}</td>
                      <td className={'nw ' + timeClass(m.kind, tm)}>{(dateKey(m.ms) === todayKey() ? '' : dateKey(m.ms) + ' ') + tm}</td>
                      <td className='muted'>{m.by_name || '-'}</td>
                      <td className='act r'>
                        <EntryEdit m={m} back='/attendance' />
                        {canUndo ? (
                          <form action={removeEntry} className='inline'>
                            <input type='hidden' name='id' value={m.id} />
                            <input type='hidden' name='back' value='/attendance' />
                            <button className='btn ghost' type='submit'>Undo</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className='totals'>Times in green are on time (check in by 09:30, check out from 17:55), red is late or early. You can change the type, date or time of an entry for 36 hours after it was made.</p>
        </div>
      ) : null}

      {see ? (
        <>
          <div className='kpis'>
            <div className='card kpi'><span>On duty</span><b>{on}</b></div>
            <div className='card kpi alt'><span>On break</span><b>{br}</b></div>
            <div className='card kpi'><span>Not in / checked out</span><b>{board.length - on - br}</b></div>
            <div className={'card kpi alt' + (over ? ' neg' : '')}><span>Breaks over {BREAK_LIMIT_MIN} min</span><b>{over}</b></div>
          </div>

          <div className='card'>
            <h3>Today's board</h3>
            {board.length ? (
              <div className='tablewrap'>
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Office</th><th>Status</th><th>In</th><th>Out</th><th>Worked today</th><th>Breaks today</th></tr>
                  </thead>
                  <tbody>
                    {board.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.name}</b></td>
                        <td><OfficeTag o={r.office} /></td>
                        <td><span className={'st ' + (r.over ? 'over' : r.state === 'on' ? 'on' : r.state === 'break' ? 'break' : '')}>{r.over ? 'Break overdue' : STATE_LABEL[r.state]}</span></td>
                        <td className={'nw ' + (r.inAt ? inClass(fmtTime(r.inAt)) : '')}>{r.inAt ? fmtTime(r.inAt) : '-'}</td>
                        <td className={'nw ' + (r.outAt ? outClass(fmtTime(r.outAt)) : '')}>{r.outAt ? fmtTime(r.outAt) : '-'}</td>
                        <td className='nw'>{fmtDur(r.worked)}</td>
                        <td className='nw'>{r.breaks} - {fmtDur(r.breakMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className='muted'>No employees yet. The Sr. Ops Manager can add them under Employees.</p>
            )}
          </div>
        </>
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
