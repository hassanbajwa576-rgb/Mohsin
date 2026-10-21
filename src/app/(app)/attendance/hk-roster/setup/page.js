import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { TYPES, ALLOWED, TLABEL, getSettings, holidaysBetween } from '@/lib/roster';
import { saveSettings, addHoliday, removeHoliday } from '@/lib/roster-actions';
import Flash from '@/components/Flash';
import HkTabs from '@/components/HkTabs';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

// Yearly allowances, hours per day, the minimum people in each office, and the holidays.
export default async function SetupPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (user.role !== 'om' && user.role !== 'sso') redirect('/attendance/hk-roster/request');
  const sp = await searchParams;
  const thisYear = Number(todayKey().slice(0, 4));
  const year = /^\d{4}$/.test(sp.y || '') ? Number(sp.y) : thisYear;
  const edit = can(user, 'roster_edit');
  const set = await getSettings();
  const hol = [...(await holidaysBetween(year + '-01-01', year + '-12-31')).entries()];

  return (
    <>
      <div className='head'>
        <div>
          <h1>Support roster setup</h1>
          <p className='muted'>Yearly time-off allowances, the minimum number of people who must be in, and the holidays.</p>
        </div>
      </div>
      <HkTabs active='setup' />
      <Flash sp={sp} />

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Allowances and cover</h3>
        <form action={saveSettings} className='form'>
          {ALLOWED.map((k) => (
            <label key={k}>{TLABEL[k]} - days a year<input type='number' name={k} min='0' max='366' step='0.5' defaultValue={set[k] || ''} placeholder='Not set' disabled={!edit} /></label>
          ))}
          <label>Hours in one working day<input type='number' name='hpd' min='1' max='24' step='0.5' defaultValue={set.hpd} disabled={!edit} /></label>
          <label>Minimum people in, LHR<input type='number' name='min_LHR' min='0' max='366' step='1' defaultValue={set.min_LHR || ''} placeholder='Not set' disabled={!edit} /></label>
          <label>Minimum people in, ISB<input type='number' name='min_ISB' min='0' max='366' step='1' defaultValue={set.min_ISB || ''} placeholder='Not set' disabled={!edit} /></label>
          <p className='muted wide'>Leave an allowance empty if it has no limit. Allowances run from 1 January to 31 December and do not carry forward. A day is flagged on the roster when fewer people than the minimum are in.</p>
          {edit ? <button className='btn primary' type='submit'>Save</button> : null}
        </form>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Holidays in {year}</h3>
        <div className='chips' style={{ marginBottom: 10 }}>
          <Link className='chip' href={'/attendance/hk-roster/setup?y=' + (year - 1)}>&lt; {year - 1}</Link>
          <Link className='chip on' href={'/attendance/hk-roster/setup?y=' + year}>{year}</Link>
          <Link className='chip' href={'/attendance/hk-roster/setup?y=' + (year + 1)}>{year + 1} &gt;</Link>
        </div>
        {edit ? (
          <form action={addHoliday} className='form'>
            <label>Date<input type='date' name='day' defaultValue={year + '-01-01'} required /></label>
            <label>Holiday name<input name='name' maxLength={80} required placeholder='For example: Eid ul Fitr' /></label>
            <button className='btn primary' type='submit'>Add holiday</button>
          </form>
        ) : null}
        {hol.length ? (
          <div className='tablewrap' style={{ marginTop: 10 }}>
            <table className='tx'>
              <thead><tr><th>Date</th><th>Holiday</th>{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {hol.map(([day, name]) => (
                  <tr key={day}>
                    <td className='nw c-meta'>{day}</td>
                    <td className='c-meta'>{name}</td>
                    {edit ? (
                      <td className='act'>
                        <form action={removeHoliday} className='inline'>
                          <input type='hidden' name='day' value={day} />
                          <ConfirmButton className='btn ghost' message='Remove this holiday?'>Remove</ConfirmButton>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No holidays added for {year}.</p>}
      </div>
    </>
  );
}