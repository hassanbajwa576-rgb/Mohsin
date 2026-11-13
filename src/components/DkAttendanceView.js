import Link from 'next/link';
import { hm, DUTY_MIN, OT_BLOCK_H } from '@/lib/dk-hours';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const h1 = (v) => String(Math.round(v * 10) / 10);

export default function DkAttendanceView({ sp, month, prev, next, who, team, people, om, convert }) {
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
              <thead><tr><th>Team member</th><th>Date</th><th>Check in</th><th>Check out</th><th>Duty time</th><th>Overtime</th></tr></thead>
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
                    </tr>
                  )),
                  <tr key={p.id + 'tot'} style={{ background: 'var(--surface,#f1efe8)' }}>
                    <td colSpan={4}><b>{p.name}: total for {month}</b></td>
                    <td><b>{hm(p.total)}</b></td>
                    <td><b>{p.over ? hm(p.over) : '-'}</b></td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className='muted'>No check-ins from the facial app for {month}.</p>}
    </>
  );
}
