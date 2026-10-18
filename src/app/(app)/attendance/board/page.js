import Link from 'next/link';
import { redirect } from 'next/navigation';
import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import {
  ATT_ROLES, allOffices, STATE_LABEL, BREAK_LIMIT_MIN, canSeeTimes, activeStaff, recentEvents, groupByStaff,
  stateOf, sessionsOf, fmtTime, fmt12, fmtDay, fmtDur, todayKey, dateKey, inClassFor, outClassFor,
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
    // A check in from an earlier day with no check out is a missed check out; the board starts clean at midnight.
    const stale = st0.state !== 'off' && dateKey(st0.since) < today;
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
            <table className='shift'>
              <thead>
                <tr><th>Employee</th><th>Office</th><th>Status</th><th>In</th><th>Out</th><th>Worked today</th><th>Breaks today</th></tr>
              </thead>
              <tbody>
                {board.map((r) => (
                  <tr key={r.id}>
                    <td className='c-name'><b>{r.name}</b></td>
                    <td className='c-meta'><OfficeTag o={r.office} /></td>
                    <td className='c-meta'><span className={'st ' + (r.over ? 'over' : r.state === 'on' ? 'on' : r.state === 'break' ? 'break' : '')}>{r.over ? 'Break overdue' : r.state === 'stale' ? 'Off duty' : STATE_LABEL[r.state]}</span>{r.state === 'stale' ? <div className='muted' style={{ fontSize: 11 }}>Missed check out {fmtDay(r.since)}</div> : null}</td>
                    <td className={'nw c-tile ' + (r.inAt ? inClassFor(fmtTime(r.inAt), r) : '')}>{r.inAt ? fmt12(r.inAt) : '-'}</td>
                    <td className={'nw c-tile ' + (r.outAt ? outClassFor(fmtTime(r.outAt), r) : '')}>{r.outAt ? fmt12(r.outAt) : '-'}</td>
                    <td className={'nw c-tile g ' + (r.outAt ? (r.worked >= 28800000 ? 't-ok' : 't-bad') : '')}>{fmtDur(r.worked)}</td>
                    <td className={'nw c-tile ' + (r.breakMs === 0 ? '' : r.breakMs > 3600000 ? 't-bad' : 't-ok')}>{r.breaks} - {fmtDur(r.breakMs)}</td>
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
