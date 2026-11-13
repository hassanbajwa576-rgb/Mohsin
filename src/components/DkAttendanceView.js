import Link from 'next/link';
import { hm, DUTY_MIN, OT_BLOCK_H } from '@/lib/dk-hours';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const h1 = (v) => String(Math.round(v * 10) / 10);

export default function DkAttendanceView({ sp, month, prev, next, who, team, people, om, convert, save, clear, fix, today }) {
  const qs = (o) => new URLSearchParams({ m: month, ...(who ? { who: String(who) } : {}), ...o }).toString();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dastarkhawan Attendance</h1>
          <p className='muted'>Check in, check out and duty time from the facial attendance app. Duty time is check out minus check in: <b style={{ color: '#a01818' }}>red</b> under 8 hours, <b style={{ color: '#17753a' }}>green</b> at 8 hours or more. Time beyond 8 hours is overtime; every {OT_BLOCK_H} overtime hours can be converted to 1 PTO day.</p>
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

      <details id='addtime' className='card' open={!!fix.p} style={{ marginBottom: 16, padding: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Add or correct a time by hand</summary>
        <p className='muted' style={{ margin: '8px 0' }}>Use this when the facial app has no time or a wrong one. A time typed here replaces the facial-app time for that day; leave a field empty to keep the facial-app value. It is saved separately, so the facial app never overwrites it, and it counts as present on the roster.</p>
        <form action={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
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
          <h2>Month summary</h2>
          <div className='rostable'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Days present</th><th>Total duty</th><th>Avg / day</th><th>Overtime (month)</th><th>Short (month)</th><th>Converted (all time)</th><th>Available OT</th><th></th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className='c-title'><b>{p.name}</b>{p.site ? <small className='muted'> {p.site}</small> : null}</td>
                    <td className='c-meta'><small className='dklbl'>Days </small>{p.present}</td>
                    <td className='c-meta'><small className='dklbl'>Total </small>{hm(p.total)}</td>
                    <td className='c-meta' style={{ color: p.counted && p.total / p.counted >= DUTY_MIN ? '#17753a' : '#a01818', fontWeight: 600 }}><small className='dklbl'>Avg/day </small>{p.counted ? hm(Math.round(p.total / p.counted)) : '-'}</td>
                    <td className='c-meta' style={{ color: p.over ? '#17753a' : undefined, fontWeight: 600 }}><small className='dklbl'>OT </small>{p.over ? hm(p.over) : '-'}</td>
                    <td className='c-meta' style={{ color: p.short ? '#a01818' : undefined }}><small className='dklbl'>Short </small>{p.short ? hm(p.short) : '-'}</td>
                    <td className='c-meta'><small className='dklbl'>Converted </small>{p.bank.used ? h1(p.bank.used) + 'h' : '-'}</td>
                    <td className='c-meta'><small className='dklbl'>Available OT </small><b>{h1(p.bank.left)}h</b>{p.bank.days ? <small className='muted'> = {p.bank.days} PTO day{p.bank.days === 1 ? '' : 's'}</small> : null}</td>
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
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 24 }}>Daily attendance</h2>
          <div className='rostable'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Date</th><th>Check in</th><th>Check out</th><th>Duty time</th><th>Overtime</th><th>Source</th><th></th></tr></thead>
              <tbody>
                {people.flatMap((p) => [
                  ...p.days.map((d) => (
                    <tr key={p.id + d.day}>
                      <td className='c-title'><b>{p.name}</b></td>
                      <td className='c-meta'>{d.day.slice(8)} {DOW[dow(d.day)]}</td>
                      <td className='c-meta'><small className='dklbl'>In </small>{d.check_in}</td>
                      <td className='c-meta'><small className='dklbl'>Out </small>{d.check_out || <span className='muted'>(no check out)</span>}</td>
                      <td className='c-meta' style={{ fontWeight: 600, color: d.mins == null ? undefined : d.mins >= DUTY_MIN ? '#17753a' : '#a01818' }}><small className='dklbl'>Duty </small>{hm(d.mins)}</td>
                      <td className='c-meta'><small className='dklbl'>OT </small>{d.mins != null && d.mins > DUTY_MIN ? hm(d.mins - DUTY_MIN) : '-'}</td>
                      <td className='c-meta' title={d.note || undefined}>{d.manual ? (d.app_in || d.app_out ? 'Facial app + manual' : 'Manual') : 'Facial app'}{d.manual && d.note ? <small className='muted'> {d.note}</small> : null}</td>
                      <td className='c-meta'>
                        <Link href={'?' + qs({ p: String(p.id), d: d.day }) + '#addtime'}>{!d.check_out ? 'Add time' : 'Edit'}</Link>
                        {d.manual ? (
                          <form action={clear} style={{ display: 'inline', marginLeft: 8 }}>
                            <input type='hidden' name='id' value={p.id} />
                            <input type='hidden' name='day' value={d.day} />
                            <ConfirmButton className='btn' message={'Remove the hand-typed time of ' + p.name + ' on ' + d.day + '?'}>Remove</ConfirmButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  )),
                  <tr key={p.id + 'tot'} style={{ background: 'var(--surface,#f1efe8)' }}>
                    <td colSpan={4}><b>{p.name}: total for {month}</b></td>
                    <td><b>{hm(p.total)}</b></td>
                    <td><b>{p.over ? hm(p.over) : '-'}</b></td>
                    <td colSpan={2}></td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className='muted'>No check-ins for {month}. Use the form above to add a time by hand.</p>}
    </>
  );
}
