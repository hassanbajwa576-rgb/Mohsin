import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { addEntry, removeEntry } from '@/lib/att-actions';
import {
  ATT_ROLES, KIND_LABEL, STATE_LABEL, BREAK_LIMIT_MIN, canSeeTimes, activeStaff, recentEvents, groupByStaff,
  stateOf, sessionsOf, dutyContacts, fmtTime, fmtDur, todayKey, dateKey,
} from '@/lib/att';
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
    label: r.name + ' (#' + r.code + ') - ' + STATE_LABEL[r.state],
    suggested: SUGGEST[r.state],
  }));

  const contacts = await dutyContacts(user);

  let mine = [];
  if (!see) {
    const raw = await q(
      `SELECT a.id, a.kind, s.name, (a.entered_at > now() - interval '30 minutes') AS fresh FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id WHERE a.entered_by = $1 AND a.entered_at > now() - interval '12 hours' ORDER BY a.id DESC LIMIT 8`,
      [user.id]
    );
    mine = raw;
  }

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
        <AttendanceEntryForm options={options} action={addEntry} />
      </div>

      {!see && mine.length > 0 ? (
        <div className='card'>
          <h3>Your recent entries</h3>
          <div className='tablewrap'>
            <table>
              <tbody>
                {mine.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.name}</b></td>
                    <td>{KIND_LABEL[m.kind]}</td>
                    <td className='act r'>
                      {m.fresh ? (
                        <form action={removeEntry} className='inline'>
                          <input type='hidden' name='id' value={m.id} />
                          <input type='hidden' name='back' value='/attendance' />
                          <button className='btn ghost' type='submit'>Undo</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='totals'>You can undo an entry within 30 minutes of adding it.</p>
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
                    <tr><th>Employee</th><th>Office</th><th>Status</th><th>Since</th><th>Worked today</th><th>Breaks today</th></tr>
                  </thead>
                  <tbody>
                    {board.map((r) => (
                      <tr key={r.id}>
                        <td><b>{r.name}</b> <span className='muted'>#{r.code}</span></td>
                        <td><span className='pill'>{r.office}</span></td>
                        <td><span className={'st ' + (r.over ? 'over' : r.state === 'on' ? 'on' : r.state === 'break' ? 'break' : '')}>{r.over ? 'Break overdue' : STATE_LABEL[r.state]}</span></td>
                        <td className='nw'>{r.since ? (dateKey(r.since) === today ? '' : dateKey(r.since) + ' ') + fmtTime(r.since) : '-'}</td>
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
