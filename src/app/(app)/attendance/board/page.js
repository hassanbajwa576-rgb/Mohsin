import Link from 'next/link';
import { redirect } from 'next/navigation';
import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import {
  ATT_ROLES, allOffices, STATE_LABEL, BREAK_LIMIT_MIN, canSeeTimes, activeStaff, recentEvents, groupByStaff,
  stateOf, sessionsOf, fmtTime, fmt12, fmtDur, todayKey, dateKey, inClass, outClass,
} from '@/lib/att';

export const dynamic = 'force-dynamic';

export default async function TodaysBoardPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  const officeSel = allOffices(user) && ['LHR', 'ISB'].includes(sp.office) ? sp.office : '';
  if (!canSeeTimes(user)) redirect('/attendance');
  const staff = (await activeStaff(user)).filter((x) => !officeSel || x.office === officeSel);
  const by = groupByStaff(await recentEvents(staff.map((x) => x.id), 3));
  const now = Date.now();
  const today = todayKey();
  const board = staff.map((x) => {
    const list = by.get(x.id) || [];
    const st0 = stateOf(list);
    // A check in older than 16 hours with no check out is a forgotten check out, not someone on duty today.
    const stale = st0.state !== 'off' && now - st0.since > 16 * 3600000;
    const st = stale ? { state: 'stale', since: st0.since } : st0;
    const ss = sessionsOf(list, now).filter((s) => dateKey(s.start) === today);
    return {
      ...x,
      ...st,
      over: st.state === 'break' && now - st.since > BREAK_LIMIT_MIN * 60000,
      worked: ss.reduce((a, s) => a + s.workedMs, 0),
      breakMs: ss.reduce((a, s) => a + s.breakMs, 0),
      breaks: ss.reduce((a, s) => a + s.breakCount, 0),
      inAt: ss.length ? ss[0].start : null,
      outAt: ss.length && ss[ss.length - 1].end ? ss[ss.length - 1].end : null,
    };
  });
  const on = board.filter((r) => r.state === 'on').length;
  const br = board.filter((r) => r.state === 'break').length;
  const over = board.filter((r) => r.over).length;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Today's board</h1>
          <p className='muted'>Who is on duty, on a break or out right now, with today's times.</p>
        </div>
      </div>

      {allOffices(user) ? (
        <div className='chips' style={{ marginBottom: 12 }}>
          {['', 'LHR', 'ISB'].map((o) => (
            <Link key={o || 'all'} href={o ? '/attendance/board?office=' + o : '/attendance/board'} className={'chip' + (officeSel === o ? ' on' : '')}>{o || 'Both offices'}</Link>
          ))}
        </div>
      ) : null}

      <div className='kpis'>
        <div className='card kpi'><span>On duty</span><b>{on}</b></div>
        <div className='card kpi alt'><span>On break</span><b>{br}</b></div>
        <div className='card kpi'><span>Not in / checked out</span><b>{board.length - on - br}</b></div>
        <div className={'card kpi alt' + (over ? ' neg' : '')}><span>Breaks over {BREAK_LIMIT_MIN} min</span><b>{over}</b></div>
      </div>

      <div className='card'>
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
                    <td><span className={'st ' + (r.over || r.state === 'stale' ? 'over' : r.state === 'on' ? 'on' : r.state === 'break' ? 'break' : '')}>{r.over ? 'Break overdue' : r.state === 'stale' ? 'Missed check out' : STATE_LABEL[r.state]}</span></td>
                    <td className={'nw ' + (r.inAt ? inClass(fmtTime(r.inAt)) : '')}>{r.inAt ? fmt12(r.inAt) : '-'}</td>
                    <td className={'nw ' + (r.outAt ? outClass(fmtTime(r.outAt)) : '')}>{r.outAt ? fmt12(r.outAt) : '-'}</td>
                    <td className={'nw ' + (r.outAt ? (r.worked >= 28800000 ? 't-ok' : 't-bad') : '')}>{fmtDur(r.worked)}</td>
                    <td className={'nw ' + (r.breakMs === 0 ? '' : r.breakMs > 3600000 ? 't-bad' : 't-ok')}>{r.breaks} - {fmtDur(r.breakMs)}</td>
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
  );
}
