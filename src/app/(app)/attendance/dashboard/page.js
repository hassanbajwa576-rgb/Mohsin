import Link from 'next/link';
import { redirect } from 'next/navigation';
import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, canSeeTimes, dayBoard, trend, stateOf, fmtTime, to12, todayKey, validDate, LATE_AFTER, EARLY_BEFORE } from '@/lib/att';

export const dynamic = 'force-dynamic';

const COLS = [['on', 'On duty'], ['break', 'On break'], ['off', 'Checked out'], ['none', 'Not in yet']];

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function AttendanceDashboard({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!canSeeTimes(user)) redirect('/attendance');
  const sp = await searchParams;
  const day = validDate(sp.date || '') ? sp.date : todayKey();
  // Only the Sr. OM and Sr. SO see both offices; everyone else sees their own office only.
  const office = allOffices(user) ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const { staff, by } = await dayBoard(day, office);
  const tr = await trend(day, office);

  const people = staff.map((s) => {
    const list = by.get(s.id) || [];
    const ins = list.filter((e) => e.kind === 'in');
    const outs = list.filter((e) => e.kind === 'out');
    const firstIn = ins.length ? fmtTime(ins[0].ms) : '';
    const lastOut = outs.length ? fmtTime(outs[outs.length - 1].ms) : '';
    return {
      ...s,
      state: ins.length ? stateOf(list).state : 'none',
      firstIn,
      lastOut,
      late: !!firstIn && firstIn > LATE_AFTER,
      early: !!lastOut && lastOut < EARLY_BEFORE,
    };
  });
  const count = (f) => people.filter(f).length;
  const present = count((p) => p.state !== 'none');
  const hours = {};
  for (const list of by.values()) {
    for (const e of list) {
      if (e.kind !== 'in') continue;
      const h = Number(fmtTime(e.ms).slice(0, 2));
      hours[h] = (hours[h] || 0) + 1;
    }
  }
  const hrs = [];
  for (let h = 6; h <= 18; h++) hrs.push([h, hours[h] || 0]);
  const hmax = Math.max(1, ...hrs.map((x) => x[1]));
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(day, -i));
  const tmap = Object.fromEntries(tr.map((r) => [r.d, r.n]));
  const tmax = Math.max(1, staff.length, ...days.map((d) => tmap[d] || 0));
  const offices = office ? [office] : ['LHR', 'ISB'];
  const qs = (o) => '/attendance/dashboard?date=' + day + (o ? '&office=' + o : '');

  return (
    <>
      <div className='head'>
        <div>
          <h1>Attendance dashboard</h1>
          <p className='muted subline'>{office || 'Both offices'} | {day}{day === todayKey() ? ' (today)' : ''} | on time: in by {to12(LATE_AFTER)}, out from {to12(EARLY_BEFORE)}</p>
        </div>
      </div>
      <div className='chips' style={{ marginBottom: 12 }}>
        {(allOffices(user) ? ['', 'LHR', 'ISB'] : [user.office_code]).map((o) => (
          <Link key={o || 'all'} href={qs(o)} className={'chip' + (office === o ? ' on' : '')}>{o || 'Both offices'}</Link>
        ))}
      </div>

      <form method='get' className='card filters compact'>
        {office ? <input type='hidden' name='office' value={office} /> : null}
        <label>Date<input type='date' name='date' defaultValue={day} /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href={office ? '/attendance/dashboard?office=' + office : '/attendance/dashboard'} className='btn ghost'>Today</Link>
      </form>

      <div className='kpis'>
        <div className='card kpi'><span>Present</span><b>{present}</b><small>of {people.length} employees</small></div>
        <div className='card kpi alt'><span>On break</span><b>{count((p) => p.state === 'break')}</b></div>
        <div className='card kpi alt'><span>Checked out</span><b>{count((p) => p.state === 'off')}</b></div>
        <div className='card kpi alt'><span>Not in yet</span><b>{count((p) => p.state === 'none')}</b></div>
        <div className={'card kpi' + (count((p) => p.late) ? ' neg' : '')}><span>Late (after {to12(LATE_AFTER)})</span><b>{count((p) => p.late)}</b></div>
      </div>

      <div className='dgrid'>
        {offices.map((o) => {
          const ps = people.filter((p) => p.office === o);
          const here = ps.filter((p) => p.state !== 'none').length;
          const pct = ps.length ? Math.round((here / ps.length) * 100) : 0;
          return (
            <div className='card' key={o}>
              <div className='fund-h'><span><OfficeTag o={o} /><b>{here} of {ps.length} present</b></span><b>{pct}%</b></div>
              <div className='pbar'><i style={{ width: pct + '%' }} /></div>
              <div className='mini'>
                <div><b>{ps.filter((p) => p.state === 'on').length}</b>On duty</div>
                <div><b>{ps.filter((p) => p.state === 'break').length}</b>Break</div>
                <div><b>{ps.filter((p) => p.state === 'off').length}</b>Out</div>
                <div><b>{ps.filter((p) => p.late).length}</b>Late</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className='card'>
        <h3>Who is where</h3>
        {people.length === 0 ? <p className='muted'>No employees yet.</p> : (
          <div className='whoq'>
            {COLS.map(([k, label]) => {
              const ps = people.filter((p) => p.state === k);
              return (
                <div key={k}>
                  <h4>{label} ({ps.length})</h4>
                  {ps.length === 0 ? <span className='muted'>-</span> : ps.map((p) => (
                    <span key={p.id} className={'chipn' + (k === 'off' ? (p.early ? ' late' : ' ok') : p.late ? ' late' : p.firstIn ? ' ok' : '')}>
                      {p.name}
                      {p.firstIn && k !== 'off' ? <small>{to12(p.firstIn)}</small> : null}
                      {k === 'off' && p.lastOut ? <small className={p.early ? 't-bad' : ''}>{to12(p.lastOut)}</small> : null}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className='dgrid'>
        <div className='card'>
          <h3>Check ins by hour</h3>
          <div className='vbars'>
            {hrs.map(([h, n]) => (
              <div key={h}><span>{n || ''}</span><i style={{ height: Math.max(2, (n / hmax) * 80) + 'px' }} /><span>{h}</span></div>
            ))}
          </div>
        </div>
        <div className='card'>
          <h3>Present, last 7 days</h3>
          <div className='vbars'>
            {days.map((d) => {
              const n = tmap[d] || 0;
              return (
                <div key={d}><span>{n}</span><i style={{ height: Math.max(2, (n / tmax) * 80) + 'px' }} /><span>{d.slice(8)}/{d.slice(5, 7)}</span></div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
