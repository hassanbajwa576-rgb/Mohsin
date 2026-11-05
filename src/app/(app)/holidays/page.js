import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { todayKey } from '@/lib/att';
import { daysFrom, niceDate } from '@/lib/tasks';
import { addGazetted, removeGazetted, addFixedHolidays } from '@/lib/holiday-actions';
import ConfirmButton from '@/components/ConfirmButton';
import Flash from '@/components/Flash';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekday = (d) => DAYS[new Date(d + 'T00:00:00Z').getUTCDay()];

export default async function HolidaysPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so']);
  const sp = await searchParams;
  const today = todayKey();
  const year = /^\d{4}$/.test(sp.y || '') ? sp.y : today.slice(0, 4);
  const om = user.role === 'om';
  const rows = await q(`SELECT to_char(day, 'YYYY-MM-DD') AS day, name FROM pc2_holidays WHERE day >= $1::date AND day <= $2::date ORDER BY day`, [year + '-01-01', year + '-12-31']);
  const next = (await q(`SELECT to_char(day, 'YYYY-MM-DD') AS day, name FROM pc2_holidays WHERE day >= $1::date ORDER BY day LIMIT 1`, [today]))[0];
  const nextIn = next ? daysFrom(today, next.day) : null;
  const byMonth = MONTHS.map((m, i) => ({ m, list: rows.filter((r) => Number(r.day.slice(5, 7)) === i + 1) })).filter((g) => g.list.length);
  const y = Number(year);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Holiday calendar</h1>
          <p className='muted'>Gazetted holidays for {year}. Holidays do not count as time off in the Support roster, and a task set to repeat on the last working day skips them.</p>
        </div>
        <div className='chips'>
          <Link className='chip' href={'/holidays?y=' + (y - 1)}>{y - 1}</Link>
          <Link className='chip on' href={'/holidays?y=' + y}>{y}</Link>
          <Link className='chip' href={'/holidays?y=' + (y + 1)}>{y + 1}</Link>
        </div>
      </div>
      <Flash sp={sp} />

      {next ? (
        <div className='card kpi' style={{ marginBottom: 16 }}>
          <span>Next holiday</span>
          <b>{next.name}</b>
          <small>{weekday(next.day)} {niceDate(next.day)} {next.day.slice(0, 4)} - {nextIn === 0 ? 'today' : nextIn === 1 ? 'tomorrow' : 'in ' + nextIn + ' days'}</small>
        </div>
      ) : null}

      {om ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Add a holiday</h3>
          <form action={addGazetted} className='form'>
            <label>Date<input type='date' name='day' defaultValue={year + '-01-01'} required /></label>
            <label className='wide'>Name<input name='name' maxLength={80} placeholder='For example Eid ul Fitr' required autoComplete='off' /></label>
            <button className='btn primary' type='submit'>Add holiday</button>
          </form>
          <form action={addFixedHolidays} className='inline' style={{ marginTop: 10 }}>
            <input type='hidden' name='year' value={year} />
            <button className='btn' type='submit'>Add the usual fixed-date holidays for {year}</button>
          </form>
          <p className='muted'>Fixed dates: Kashmir Day 5 Feb, Pakistan Day 23 Mar, Labour Day 1 May, Independence Day 14 Aug, 25 Dec. Eid, Ashura and Eid Milad-un-Nabi follow the moon, so add them here when the government notifies the dates.</p>
        </div>
      ) : null}

      {byMonth.length ? byMonth.map((g) => (
        <div className='card' key={g.m}>
          <h3 style={{ marginTop: 0 }}>{g.m}</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <tbody>
                {g.list.map((h) => {
                  const d = daysFrom(today, h.day);
                  return (
                    <tr key={h.day}>
                      <td className='c-title'><b>{h.name}</b><div className='muted'>{weekday(h.day)}</div></td>
                      <td className='r nw c-amt'><b>{niceDate(h.day)}</b></td>
                      <td className='c-meta'>{d < 0 ? 'Past' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : 'In ' + d + ' days'}</td>
                      {om ? (
                        <td className='act'>
                          <form action={removeGazetted} className='inline'>
                            <input type='hidden' name='day' value={h.day} />
                            <ConfirmButton className='btn ghost' message='Remove this holiday?'>Remove</ConfirmButton>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )) : <div className='card'><p className='muted'>No holidays listed for {year} yet.{om ? ' Use the buttons above to add them.' : ' The Sr. Ops Manager adds them.'}</p></div>}
    </>
  );
}
