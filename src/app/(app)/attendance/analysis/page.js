import Link from 'next/link';
import { redirect } from 'next/navigation';
import OfficeTag from '@/components/OfficeTag';
import ReportFilters from '@/components/ReportFilters';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import {
  ATT_ROLES, allOffices, departments, todayKey, validDate, fmtDur, to12, fmtTime, shiftText, BREAK_LIMIT_MIN, inClassFor, outClassFor,
} from '@/lib/att';
import { analyse, addDaysKey, BUCKETS } from '@/lib/analysis';

export const dynamic = 'force-dynamic';

const VIEWS = [['employees', 'Employees'], ['departments', 'Departments'], ['shifts', 'Shifts'], ['breaks', 'Breaks']];
const pc = (p) => (p == null ? '-' : Math.round(p) + '%');

function Pct({ p }) {
  if (p == null) return '-';
  return (
    <>
      <span className='pt'><i style={{ width: Math.max(0, Math.min(100, p)) + '%' }} /></span>
      {Math.round(p)}%
    </>
  );
}

export default async function AttendanceAnalysisPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'att_reports')) redirect('/attendance');
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  let from = validDate(sp.from || '') ? sp.from : addDaysKey(to, -29);
  if (from > to) from = to;
  const office = allOffices(user) ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const depts = await departments();
  const dsel = [].concat(sp.dept || []).filter((d) => depts.includes(d));
  const view = VIEWS.some((v) => v[0] === sp.view) ? sp.view : 'employees';
  const empId = Number(sp.emp) || 0;

  const data = await analyse({ from, to, office, depts: dsel });
  const t = data.totals;

  const base = new URLSearchParams({ from, to, ...(office ? { office } : {}) });
  dsel.forEach((d) => base.append('dept', d));
  const link = (extra) => {
    const p = new URLSearchParams(base);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return '/attendance/analysis?' + p.toString();
  };
  const xlsx = '/attendance/analysis/xlsx?' + new URLSearchParams({ ...Object.fromEntries(base), view }).toString() + dsel.map((d) => '&dept=' + encodeURIComponent(d)).join('');
  const emp = empId ? data.rows.find((r) => r.id === empId) : null;
  const maxWk = 100;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Attendance analysis</h1>
          <p className='muted'>
            {from} to {to} | {office || 'Both offices'} | {data.workDays} working days. On time means checking in within 30 minutes of the shift start (9:30 AM unless the person or department has another shift).
          </p>
        </div>
        <div className='inline'>
          <a href={xlsx} className='btn primary'>Download Excel (.xlsx)</a>
        </div>
      </div>

      <ReportFilters today={today} from={from} to={to} office={office} canOffice={allOffices(user)} depts={depts} selected={dsel} hidden={{ view }} resetHref={'/attendance/analysis?view=' + view} />

      <div className='chips' style={{ marginBottom: 12 }}>
        {VIEWS.map(([k, label]) => (
          <Link key={k} href={link({ view: k })} className={'chip' + (view === k ? ' on' : '')}>{label}</Link>
        ))}
      </div>

      <div className='kpis'>
        <div className='card kpi'><span>Employees</span><b>{t.people}</b><small>{t.shifts} shifts recorded</small></div>
        <div className='card kpi'><span>Attendance rate</span><b>{pc(t.attendancePct)}</b><small>days present of working days</small></div>
        <div className='card kpi'><span>On time</span><b>{pc(t.onTimePct)}</b><small>with the 30 minute grace</small></div>
        <div className='card kpi'><span>Average worked</span><b>{fmtDur(t.avgWorked)}</b><small>per completed shift</small></div>
        <div className={'card kpi' + (t.over ? ' neg' : '')}><span>Shifts with over 1 h of breaks</span><b>{t.over}</b><small>limit {BREAK_LIMIT_MIN} minutes</small></div>
      </div>

      {data.weeks.length > 1 ? (
        <div className='card'>
          <h3>On time, week by week</h3>
          <div className='wk'>
            {data.weeks.map((w) => (
              <div key={w.week} className='wkc' title={w.shifts + ' shifts, ' + w.late + ' late'}>
                <b>{pc(w.onTimePct)}</b>
                <div className='wkbar'><i style={{ height: Math.max(3, ((w.onTimePct || 0) / maxWk) * 100) + '%' }} /></div>
                <small>{w.week.slice(5)}</small>
              </div>
            ))}
          </div>
          <p className='totals'>Each bar is a week starting on the date shown (month-day).</p>
        </div>
      ) : null}

      {view === 'employees' ? (
        <div className='card'>
          {emp ? (
            <>
              <div className='head'>
                <div>
                  <h3 style={{ margin: 0 }}>{emp.name} <OfficeTag o={emp.office} /></h3>
                  <p className='muted'>{emp.dept || '-'} | {shiftText(emp)} | {emp.days} days present of {emp.expected}</p>
                </div>
                <Link href={link({ view: 'employees' })} className='btn ghost'>Back to all employees</Link>
              </div>
              {emp.sess.length ? (
                <div className='tablewrap'>
                  <table className='shift'>
                    <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Breaks</th><th>Break time</th><th>Worked</th></tr></thead>
                    <tbody>
                      {emp.sess.map((x, i) => (
                        <tr key={i}>
                          <td className='nw c-name'><b>{x.date}</b></td>
                          <td className={'nw c-tile ' + inClassFor(fmtTime(x.start), x.st)}>{to12(fmtTime(x.start))}</td>
                          <td className={'nw c-tile ' + (x.end ? outClassFor(fmtTime(x.end), x.st) : '')}>{x.end ? to12(fmtTime(x.end)) : x.missed ? 'Missed check out' : 'On duty'}</td>
                          <td className='c-tile'>{x.breakCount}</td>
                          <td className={'nw c-tile ' + (x.breakMs > BREAK_LIMIT_MIN * 60000 ? 't-bad' : '')}>{fmtDur(x.breakMs)}</td>
                          <td className='nw c-tile g'>{x.missed ? '-' : fmtDur(x.workedMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className='muted'>No attendance for this person in the range.</p>}
            </>
          ) : data.rows.length ? (
            <>
              <div className='tablewrap'>
                <table className='shift'>
                  <thead>
                    <tr><th>Employee</th><th>Department</th><th>Office</th><th>Shift</th><th>Days</th><th>Avg in</th><th>Late</th><th>Early out</th><th>Avg worked</th><th>Avg break</th><th>Over 1 h</th><th>On time</th></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td className='c-name'><Link href={link({ view: 'employees', emp: r.id })}><b>{r.name}</b></Link></td>
                        <td className='c-meta'>{r.dept || '-'}</td>
                        <td className='c-meta'><OfficeTag o={r.office} /></td>
                        <td className='c-meta'>{r.shift ? shiftText(r) : '-'}</td>
                        <td className='nw c-tile'>{r.days} of {r.expected}</td>
                        <td className='nw c-tile'>{r.avgIn ? to12(r.avgIn) : '-'}</td>
                        <td className={'nw c-tile ' + (r.late ? 't-bad' : '')}>{r.late}</td>
                        <td className={'nw c-tile ' + (r.early ? 't-bad' : '')}>{r.early}</td>
                        <td className='nw c-tile'>{r.closedN ? fmtDur(r.avgWorked) : '-'}</td>
                        <td className='nw c-tile'>{r.closedN ? fmtDur(r.avgBreak) : '-'}</td>
                        <td className={'nw c-tile ' + (r.overShifts ? 't-bad' : '')}>{r.overShifts}</td>
                        <td className='nw c-tile g'><Pct p={r.onTimePct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className='totals'>Click a name for that person's day by day history. Days = days present of the days the office had check ins.</p>
            </>
          ) : <p className='muted'>No employees match these filters.</p>}
        </div>
      ) : null}

      {view === 'departments' ? (
        <div className='card'>
          {data.byDept.length ? (
            <div className='tablewrap'>
              <table className='shift'>
                <thead><tr><th>Department</th><th>People</th><th>Attendance</th><th>On time</th><th>Late</th><th>Early out</th><th>Avg worked</th><th>Avg break</th><th>Over 1 h</th></tr></thead>
                <tbody>
                  {data.byDept.map((g) => (
                    <tr key={g.key}>
                      <td className='c-name'><b>{g.label}</b></td>
                      <td className='nw c-tile'>{g.people}</td>
                      <td className='nw c-tile'><Pct p={g.attendancePct} /></td>
                      <td className='nw c-tile g'><Pct p={g.onTimePct} /></td>
                      <td className={'nw c-tile ' + (g.late ? 't-bad' : '')}>{g.late}</td>
                      <td className={'nw c-tile ' + (g.early ? 't-bad' : '')}>{g.early}</td>
                      <td className='nw c-tile'>{g.closedN ? fmtDur(g.avgWorked) : '-'}</td>
                      <td className='nw c-tile'>{g.closedN ? fmtDur(g.avgBreak) : '-'}</td>
                      <td className={'nw c-tile ' + (g.over ? 't-bad' : '')}>{g.over}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className='muted'>No data for these filters.</p>}
        </div>
      ) : null}

      {view === 'shifts' ? (
        <div className='card'>
          {data.byShift.length ? (
            <div className='tablewrap'>
              <table className='shift'>
                <thead><tr><th>Shift</th><th>People</th><th>Attendance</th><th>On time</th><th>Late</th><th>Early out</th><th>Avg worked</th><th>Avg break</th><th>Over 1 h</th></tr></thead>
                <tbody>
                  {data.byShift.map((g) => (
                    <tr key={g.key || 'none'}>
                      <td className='c-name'><b>{g.label}</b></td>
                      <td className='nw c-tile'>{g.people}</td>
                      <td className='nw c-tile'><Pct p={g.attendancePct} /></td>
                      <td className='nw c-tile g'><Pct p={g.onTimePct} /></td>
                      <td className={'nw c-tile ' + (g.late ? 't-bad' : '')}>{g.late}</td>
                      <td className={'nw c-tile ' + (g.early ? 't-bad' : '')}>{g.early}</td>
                      <td className='nw c-tile'>{g.closedN ? fmtDur(g.avgWorked) : '-'}</td>
                      <td className='nw c-tile'>{g.closedN ? fmtDur(g.avgBreak) : '-'}</td>
                      <td className={'nw c-tile ' + (g.over ? 't-bad' : '')}>{g.over}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className='muted'>No data for these filters.</p>}
          <p className='totals'>"No shift set" people follow the standard 9:30 AM start. Set shifts on the Employees page.</p>
        </div>
      ) : null}

      {view === 'breaks' ? (
        <>
          <div className='kpis'>
            <div className='card kpi'><span>Breaks taken</span><b>{data.breaks.count}</b></div>
            <div className='card kpi'><span>Average break</span><b>{data.breaks.count ? fmtDur(data.breaks.avgMs) : '-'}</b></div>
            <div className={'card kpi' + (data.breaks.over1h ? ' neg' : '')}><span>Single breaks over 1 hour</span><b>{data.breaks.over1h}</b><small>{data.breaks.count ? pc((data.breaks.over1h / data.breaks.count) * 100) + ' of all breaks' : ''}</small></div>
            <div className='card kpi'><span>Longest break</span><b>{data.breaks.longest ? fmtDur(data.breaks.longest.ms) : '-'}</b><small>{data.breaks.longest ? data.breaks.longest.name + ', ' + data.breaks.longest.date : ''}</small></div>
          </div>
          <div className='grid2'>
            <div className='card'>
              <h3>How long breaks last</h3>
              {data.breaks.buckets.map((b, i) => {
                const mx = Math.max(1, ...data.breaks.buckets.map((x) => x.n));
                return (
                  <div key={b.label} className='hrow'>
                    <span>{BUCKETS[i][0]}</span>
                    <div className='track'><div className={'fill' + (i === 3 ? ' bad' : '')} style={{ width: (b.n / mx) * 100 + '%' }} /></div>
                    <b>{b.n}</b>
                  </div>
                );
              })}
            </div>
            <div className='card'>
              <h3>Most shifts with over 1 hour of breaks</h3>
              {data.breaks.top.length ? (
                <div className='tablewrap'>
                  <table className='shift'>
                    <thead><tr><th>Employee</th><th>Department</th><th>Shifts over 1 h</th><th>Avg break</th><th>Longest</th></tr></thead>
                    <tbody>
                      {data.breaks.top.map((r) => (
                        <tr key={r.id}>
                          <td className='c-name'><Link href={link({ view: 'employees', emp: r.id })}><b>{r.name}</b></Link></td>
                          <td className='c-meta'>{r.dept || '-'}</td>
                          <td className='nw c-tile t-bad'>{r.overShifts}</td>
                          <td className='nw c-tile'>{fmtDur(r.avgBreak)}</td>
                          <td className='nw c-tile'>{fmtDur(r.longest)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className='muted'>Nobody went over {BREAK_LIMIT_MIN} minutes of breaks in a shift in this range.</p>}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
