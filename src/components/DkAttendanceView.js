import Link from 'next/link';
import { hm, DUTY_MIN, OT_BLOCK_H } from '@/lib/dk-hours';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const h1 = (v) => String(Math.round(v * 10) / 10);
const pct = (m) => Math.max(0, Math.min(100, (m / 720) * 100)); // the bar runs 0 to 12 hours; the line sits at 8

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'dka-kpi' + (tone ? ' ' + tone : '')}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export default function DkAttendanceView({ sp, month, prev, next, who, team, people, om, convert, save, clear, fix, today }) {
  const qs = (o) => new URLSearchParams({ m: month, ...(who ? { who: String(who) } : {}), ...o }).toString();
  const tTotal = people.reduce((a, p) => a + p.total, 0);
  const tOver = people.reduce((a, p) => a + p.over, 0);
  const tShort = people.reduce((a, p) => a + p.short, 0);
  const tLeft = people.reduce((a, p) => a + p.bank.left, 0);
  const tDays = people.reduce((a, p) => a + p.bank.days, 0);
  const open = !!who || people.length <= 2;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dastarkhawan Attendance</h1>
          <p className='muted'>Check in, check out and duty time from the facial attendance app (or typed in by hand). The bar shows duty time against 8 hours: <b className='dka-t g'>green</b> from 8 hours, <b className='dka-t r'>red</b> under 8. Time beyond 8 hours is overtime; every {OT_BLOCK_H} overtime hours convert to 1 PTO day.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='chips' style={{ marginBottom: 12, alignItems: 'center' }}>
        <Link className='chip' href={'?' + qs({ m: prev })}>&larr; {prev}</Link>
        <b style={{ padding: '0 8px' }}>{month}</b>
        <Link className='chip' href={'?' + qs({ m: next })}>{next} &rarr;</Link>
        <Link className={'chip' + (!who ? ' on' : '')} href={'?' + new URLSearchParams({ m: month }).toString()}>Everyone</Link>
        {team.map((p) => <Link key={p.id} className={'chip' + (who === p.id ? ' on' : '')} href={'?' + qs({ who: String(p.id) })}>{p.name}</Link>)}
      </div>

      <details id='addtime' className='dka-card' open={!!fix.p}>
        <summary>+ Add or correct a time by hand</summary>
        <p className='muted' style={{ margin: '8px 0' }}>For when the facial app has no time or a wrong one. A time typed here replaces the facial-app time for that day; leave a field empty to keep the facial-app value. It is saved separately, so the facial app never overwrites it, and it counts as present on the roster.</p>
        <form action={save} className='dka-form'>
          <input type='hidden' name='m' value={month} />
          <label>Team member
            <select name='id' required defaultValue={fix.p || ''}>
              <option value='' disabled>Pick a person</option>
              {team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Date<input type='date' name='day' required max={today} defaultValue={fix.d || ''} /></label>
          <label>Check in<input type='time' name='in' defaultValue={fix.in || ''} /></label>
          <label>Check out<input type='time' name='out' defaultValue={fix.out || ''} /></label>
          <label style={{ flex: '1 1 180px' }}>Note (optional)<input name='note' maxLength={200} placeholder='e.g. facial app was down' defaultValue={fix.note || ''} /></label>
          <button type='submit' className='btn'>Save time</button>
        </form>
      </details>

      {people.length ? (
        <>
          <div className='dka-kpis'>
            <Kpi label='Team duty time' value={hm(tTotal)} sub={people.length + ' ' + (people.length === 1 ? 'person' : 'people') + ' in ' + month} />
            <Kpi label='Overtime this month' value={tOver ? hm(tOver) : '-'} sub='time beyond 8 h a day' tone={tOver ? 'good' : ''} />
            <Kpi label='Short this month' value={tShort ? hm(tShort) : '-'} sub='time under 8 h a day' tone={tShort ? 'bad' : ''} />
            <Kpi label='Overtime to convert' value={h1(tLeft) + ' h'} sub={tDays ? '= ' + tDays + ' PTO day' + (tDays === 1 ? '' : 's') + ' ready' : 'under ' + OT_BLOCK_H + ' h each'} tone={tDays ? 'good' : ''} />
          </div>

          <h2 className='dka-h'>Who has what</h2>
          <div className='rostable'>
            <table className='tx dka-sum'>
              <thead><tr><th>Team member</th><th>Days</th><th>Total duty</th><th>Avg / day</th><th>Overtime</th><th>Short</th><th>Already converted</th><th>Available overtime</th><th></th></tr></thead>
              <tbody>
                {people.map((p) => {
                  const avg = p.counted ? Math.round(p.total / p.counted) : null;
                  return (
                    <tr key={p.id}>
                      <td className='c-title'><b>{p.name}</b>{p.site ? <span className='dka-pill'>{p.site}</span> : null}</td>
                      <td className='c-meta'><small className='dklbl'>Days </small>{p.present}</td>
                      <td className='c-meta'><small className='dklbl'>Total </small>{hm(p.total)}</td>
                      <td className={'c-meta dka-t ' + (avg == null ? '' : avg >= DUTY_MIN ? 'g' : 'r')}><small className='dklbl'>Avg/day </small>{avg == null ? '-' : hm(avg)}</td>
                      <td className={'c-meta dka-t ' + (p.over ? 'g' : '')}><small className='dklbl'>OT </small>{p.over ? hm(p.over) : '-'}</td>
                      <td className={'c-meta ' + (p.short ? 'dka-t r' : '')}><small className='dklbl'>Short </small>{p.short ? hm(p.short) : '-'}</td>
                      <td className='c-meta'><small className='dklbl'>Converted </small>{p.bank.used ? h1(p.bank.used) + ' h' : '-'}</td>
                      <td className='c-meta'><small className='dklbl'>Available </small><b>{h1(p.bank.left)} h</b>{p.bank.days ? <span className='dka-pill ok'>= {p.bank.days} PTO day{p.bank.days === 1 ? '' : 's'}</span> : null}</td>
                      <td>
                        {om && p.bank.days >= 1 ? (
                          <form action={convert}>
                            <input type='hidden' name='id' value={p.id} />
                            <input type='hidden' name='m' value={month} />
                            <ConfirmButton className='btn' message={'Convert ' + p.bank.days * OT_BLOCK_H + ' overtime hours of ' + p.name + ' to ' + p.bank.days + ' PTO day(s)?'}>Convert to PTO</ConfirmButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className='dka-h'>Day by day</h2>
          {people.map((p) => (
            <details key={p.id} className='dka-person' open={open}>
              <summary>
                <b>{p.name}</b>
                {p.site ? <span className='dka-pill'>{p.site}</span> : null}
                <span className='dka-stat'>{p.present} day{p.present === 1 ? '' : 's'}</span>
                <span className='dka-stat'>{hm(p.total)} total</span>
                {p.over ? <span className='dka-stat dka-t g'>+{hm(p.over)} overtime</span> : null}
                {p.short ? <span className='dka-stat dka-t r'>-{hm(p.short)} short</span> : null}
              </summary>
              <div className='dka-row dka-head'>
                <span>Date</span><span>Check in &rarr; out</span><span>Duty time (line = 8 h)</span><span>Overtime</span><span>Source</span><span></span>
              </div>
              {p.days.map((d) => {
                const tone = d.mins == null ? '' : d.mins >= DUTY_MIN ? 'g' : 'r';
                return (
                  <div key={d.day} className='dka-row'>
                    <span className='dka-date'><b>{d.day.slice(8)}</b> {DOW[dow(d.day)]}</span>
                    <span className='dka-times'>
                      <small className='dklbl'>In </small>{d.check_in || '-'} <i>&rarr;</i> <small className='dklbl'>Out </small>{d.check_out || <span className='dka-pill warn'>No check out</span>}
                    </span>
                    <span className='dka-barcell'>
                      {d.mins == null ? <span className='muted'>-</span> : (
                        <>
                          <span className='dka-bar'><i className={'dka-f ' + tone} style={{ width: pct(d.mins) + '%' }} /><u /></span>
                          <span className={'dka-t ' + tone}>{hm(d.mins)}</span>
                        </>
                      )}
                    </span>
                    <span className='dka-ot'>{d.mins != null && d.mins > DUTY_MIN ? <span className='dka-pill ok'>+{hm(d.mins - DUTY_MIN)}</span> : <span className='muted'>-</span>}</span>
                    <span className='dka-src'>
                      <span className={'dka-pill' + (d.manual ? ' man' : '')}>{d.manual ? (d.app_in || d.app_out ? 'App + manual' : 'Manual') : 'Facial app'}</span>
                      {d.manual && d.note ? <small className='muted'>{d.note}</small> : null}
                    </span>
                    <span className='dka-act'>
                      <Link href={'?' + qs({ p: String(p.id), d: d.day }) + '#addtime'}>{!d.check_out ? 'Add time' : 'Edit'}</Link>
                      {d.manual ? (
                        <form action={clear}>
                          <input type='hidden' name='id' value={p.id} />
                          <input type='hidden' name='day' value={d.day} />
                          <ConfirmButton className='btn sm' message={'Remove the hand-typed time of ' + p.name + ' on ' + d.day + '?'}>Remove</ConfirmButton>
                        </form>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </details>
          ))}
        </>
      ) : <p className='muted'>No check-ins for {month}. Use the form above to add a time by hand.</p>}
    </>
  );
}
