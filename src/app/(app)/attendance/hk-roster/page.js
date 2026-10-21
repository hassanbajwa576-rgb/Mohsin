import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TYPES, TINFO, addDays, daysIn, validMonth, shiftMonth, monthOff, offToday, comingUp, pendingRequests, hkPeople, upcomingBirthdays, getSettings, holidaysBetween } from '@/lib/roster';
import { addTimeOff, deleteTimeOff, addHkPerson, updateHkPerson, removeHkPerson, decideTimeOff } from '@/lib/roster-actions';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import ConfirmButton from '@/components/ConfirmButton';
import HkTabs from '@/components/HkTabs';

export const dynamic = 'force-dynamic';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const num = (v) => String(Math.round(v * 100) / 100);
const span = (e) => e.from_date + (e.to_date !== e.from_date ? ' to ' + e.to_date : '') + (e.hours != null ? ' (' + num(e.hours) + ' h)' : '');

// Who in the support team is off, and when. Only the Sr. Ops Manager and the Sr. Support Officer see this page.
export default async function RosterPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (user.role !== 'om' && user.role !== 'sso') redirect('/attendance/hk-roster/request');
  const sp = await searchParams;
  const today = todayKey();
  const month = validMonth(sp.m) ? sp.m : today.slice(0, 7);
  const edit = can(user, 'roster_edit');
  const both = allOffices(user);
  const office = both ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const who = String(sp.who || '').trim().slice(0, 60);
  const everyone = sp.all === '1';
  const n = daysIn(month);
  const [y, mo] = month.split('-').map(Number);

  const entries = await monthOff({ month, office, who });
  const team = await hkPeople({ office });
  const people = everyone ? await hkPeople({ office, who }) : [];
  const rows = everyone ? people : [...new Map(entries.map((e) => [e.staff_id, { id: e.staff_id, name: e.name, dept: e.dept, office: e.office }])).values()];
  const settings = await getSettings();
  const hol = await holidaysBetween(month + '-01', month + '-' + String(n).padStart(2, '0'));
  const off = await offToday(today, office);
  const coming = await comingUp(today, 14, office);
  const pending = edit ? await pendingRequests(office) : [];
  const birthdays = upcomingBirthdays(team, today, 30);
  const names = team.map((p) => p.name);

  const dayKey = (d) => month + '-' + String(d).padStart(2, '0');
  const grid = new Map();
  for (const e of entries) {
    if (!grid.has(e.staff_id)) grid.set(e.staff_id, {});
    for (let d = 1; d <= n; d++) {
      const key = dayKey(d);
      if (key >= e.from_date && key <= e.to_date) {
        const cur = grid.get(e.staff_id)[d];
        if (!cur) grid.get(e.staff_id)[d] = { ...e };
        else if (e.hours != null && cur.hours != null && cur.kind === e.kind) cur.hours += e.hours;
      }
    }
  }

  // Cover check: a day is flagged when fewer people are in than the minimum set for an office.
  const lowCover = new Map();
  for (const code of ['LHR', 'ISB']) {
    const min = settings['min_' + code];
    const size = team.filter((p) => p.office === code).length;
    if (!(min > 0) || !size || (office && office !== code)) continue;
    for (let d = 1; d <= n; d++) {
      if (hol.has(dayKey(d))) continue;
      const out = new Set(entries.filter((e) => e.office === code && e.hours == null && dayKey(d) >= e.from_date && dayKey(d) <= e.to_date).map((e) => e.staff_id)).size;
      if (size - out < min) lowCover.set(d, (lowCover.get(d) ? lowCover.get(d) + '; ' : '') + code + ': ' + (size - out) + ' in, ' + min + ' needed');
    }
  }

  const qp = (extra = {}) => new URLSearchParams({ m: month, ...(office && both ? { office } : {}), ...(who ? { who } : {}), ...(everyone ? { all: '1' } : {}), ...extra }).toString();
  const days = Array.from({ length: n }, (_, i) => i + 1);
  const wd = (d) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const count = (e) => (e.hours != null ? num(e.hours) + ' h' : String(Math.round((new Date(e.to_date) - new Date(e.from_date)) / 864e5) + 1) + ' day(s)');

  return (
    <>
      <div className='head'>
        <div>
          <h1>Support Roster</h1>
          <p className='muted'>Who in the support team will be off, and when (full days or a number of hours). Only the Sr. Ops Manager and the Sr. Support Officer can see and change it.</p>
        </div>
        <div className='inline'>
          <a href={'/attendance/hk-roster/xlsx?' + qp()} className='btn primary'>Download Excel (.xlsx)</a>
        </div>
      </div>
      <HkTabs active='roster' />
      <Flash sp={sp} />

      <div className='kpis'>
        <div className='card kpi'><span>Off today</span><b>{off.length}</b><small>{off.length ? off.slice(0, 6).map((e) => e.name).join(', ') + (off.length > 6 ? ' ...' : '') : 'Everyone is expected in'}</small></div>
        <div className='card kpi alt'><span>People off in {MONTHS[mo - 1]}</span><b>{new Set(entries.map((e) => e.staff_id)).size}</b></div>
        <div className={'card kpi alt' + (lowCover.size ? ' neg' : '')}><span>Days short of cover</span><b>{lowCover.size}</b><small>{lowCover.size ? 'Marked in red on the grid' : 'Set a minimum in Setup'}</small></div>
        <div className={'card kpi alt' + (pending.length ? ' neg' : '')}><span>Requests waiting</span><b>{pending.length}</b></div>
      </div>

      {pending.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Time off requests ({pending.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Type</th><th>When</th><th>Asked by</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {pending.map((e) => (
                  <tr key={e.id}>
                    <td className='c-title'><OfficeTag o={e.office} /><b>{e.name}</b></td>
                    <td className='c-meta'><span className='rostag' style={{ background: TINFO[e.kind].color }}>{TINFO[e.kind].label}</span></td>
                    <td className='nw c-meta'>{span(e)}</td>
                    <td className='c-meta'>{e.req_name || '-'}</td>
                    <td className='c-meta'>{e.note || ''}</td>
                    <td className='act'>
                      <form action={decideTimeOff} className='inline'>
                        <input type='hidden' name='id' value={e.id} />
                        <button name='decision' value='approve' className='btn ok' type='submit'>Approve</button>
                        <button name='decision' value='decline' className='btn bad' type='submit'>Decline</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Coming up: the next 14 days</h3>
        {coming.length ? (
          <ul className='comingup'>
            {coming.map((e) => <li key={e.id}><b>{e.name}</b> <span className='rostag' style={{ background: TINFO[e.kind].color }}>{TINFO[e.kind].label}</span> {span(e)}{e.note ? <span className='muted'> - {e.note}</span> : null}</li>)}
          </ul>
        ) : <p className='muted'>Nobody is off in the next 14 days.</p>}
        {birthdays.length ? <p className='muted' style={{ marginBottom: 0 }}>Birthdays soon: {birthdays.map((b) => b.name + ' (' + b.day.slice(5) + ')').join(', ')}</p> : null}
      </div>

      {edit ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Add time off</h3>
          <form action={addTimeOff} className='form'>
            <input type='hidden' name='month' value={month} />
            <label>Team member<input name='name' list='ros-names' placeholder='Type a name' required autoComplete='off' /></label>
            <datalist id='ros-names'>{names.map((nm) => <option key={nm} value={nm} />)}</datalist>
            <label>Type<select name='kind' defaultValue='pto'>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>First day<input type='date' name='from' defaultValue={today} required /></label>
            <label>Last day<input type='date' name='to' defaultValue={today} required /></label>
            <label style={{ gridColumn: 'span 3' }}>Note (optional)<input name='note' maxLength={120} placeholder='For example: family wedding' /></label>
            <label>Hours (only for part of a day)<input type='number' name='hours' min='0.25' max='24' step='0.25' placeholder='Leave empty for full days' /></label>
            <button className='btn primary' type='submit'>Add time off</button>
          </form>
        </div>
      ) : null}

      {edit ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Support team ({team.length})</h3>
          <form action={addHkPerson} className='form'>
            <label>Name<input name='name' required maxLength={80} placeholder='Team member name' autoComplete='off' /></label>
            <label>Role (optional)<input name='role' maxLength={60} placeholder='For example: cleaner, office boy' /></label>
            <label>Phone<input name='phone' type='tel' maxLength={30} placeholder='03xx xxxxxxx' /></label>
            <label>Joining date<input type='date' name='joined' /></label>
            <label>Birthday<input type='date' name='birthday' /></label>
            {both ? <label>Office<select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select></label> : null}
            <button className='btn primary' type='submit'>Add to the Support team</button>
          </form>
          {team.length ? (
            <div className='tablewrap' style={{ marginTop: 10 }}>
              <table className='tx'>
                <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Joined</th><th>Birthday</th><th></th></tr></thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id}>
                      <td className='c-title'><OfficeTag o={p.office} /><b>{p.name}</b></td>
                      <td className='c-meta'>{p.dept || '-'}</td>
                      <td className='c-meta'>{p.phone ? <a href={'tel:' + p.phone}>{p.phone}</a> : '-'}</td>
                      <td className='nw c-meta'>{p.joined_on || '-'}</td>
                      <td className='nw c-meta'>{p.birthday ? p.birthday.slice(5) : '-'}</td>
                      <td className='act'>
                        <details className='entry-edit'>
                          <summary className='btn'>Edit</summary>
                          <form action={updateHkPerson} className='entry-edit-form'>
                            <input type='hidden' name='id' value={p.id} />
                            <label>Name<input name='name' defaultValue={p.name} maxLength={80} required /></label>
                            <label>Role<input name='role' defaultValue={p.dept || ''} maxLength={60} /></label>
                            <label>Phone<input name='phone' defaultValue={p.phone || ''} maxLength={30} /></label>
                            <label>Joining date<input type='date' name='joined' defaultValue={p.joined_on || ''} /></label>
                            <label>Birthday<input type='date' name='birthday' defaultValue={p.birthday || ''} /></label>
                            <button className='btn primary' type='submit'>Save</button>
                          </form>
                        </details>
                        <form action={removeHkPerson} className='inline'>
                          <input type='hidden' name='id' value={p.id} />
                          <ConfirmButton className='btn ghost' message='Remove this person from the Support team?'>Remove</ConfirmButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className='card rosnav'>
        <Link className='btn' href={'/attendance/hk-roster?' + qp({ m: shiftMonth(month, -1) })}>&lt; {MONTHS[(mo + 10) % 12]}</Link>
        <b>{MONTHS[mo - 1]} {y}</b>
        <Link className='btn' href={'/attendance/hk-roster?' + qp({ m: shiftMonth(month, 1) })}>{MONTHS[mo % 12]} &gt;</Link>
        <Link className='btn ghost' href={'/attendance/hk-roster?' + qp({ m: today.slice(0, 7) })}>This month</Link>
      </div>
      {both ? (
        <AutoFilters
          hidden={{ m: month, who, all: everyone ? '1' : '' }}
          fields={[{ name: 'office', label: 'Office', value: office, options: [['', 'Both offices'], ['LHR', 'LHR'], ['ISB', 'ISB']] }]}
        />
      ) : null}

      <div className='card'>
        <div className='roslegend'>
          {TYPES.map(([k, l, letter, color]) => <span key={k}><i style={{ background: color }}>{letter}</i>{l}</span>)}
          <span><i className='hollegend'>H</i>Holiday</span>
          <Link href={'/attendance/hk-roster?' + qp({ all: everyone ? '' : '1' })} className='rosall'>{everyone ? 'Show only people with time off' : 'Show the whole team'}</Link>
        </div>
        {rows.length ? (
          <div className='rostable'>
            <table className='rost'>
              <thead>
                <tr>
                  <th className='rn'>Team member</th>
                  {days.map((d) => <th key={d} className={(wd(d) === 0 || wd(d) === 6 ? 'we ' : '') + (hol.has(dayKey(d)) ? 'hol ' : '') + (lowCover.has(d) ? 'lowcov ' : '') + (dayKey(d) === today ? 'tod' : '')} title={[hol.get(dayKey(d)), lowCover.get(d)].filter(Boolean).join(' | ') || undefined}>{d}<small>{DOW[wd(d)]}</small></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className='rn'><OfficeTag o={p.office} /><b>{p.name}</b>{p.dept ? <small className='muted'> {p.dept}</small> : null}</td>
                    {days.map((d) => {
                      const e = (grid.get(p.id) || {})[d];
                      const t = e ? TINFO[e.kind] : null;
                      const h = hol.has(dayKey(d));
                      return (
                        <td key={d} className={(wd(d) === 0 || wd(d) === 6 ? 'we ' : '') + (h && !t ? 'hol' : '')} style={t ? { background: t.color } : undefined} title={e ? p.name + ': ' + t.label + ' ' + e.from_date + (e.to_date !== e.from_date ? ' to ' + e.to_date : '') + (e.note ? ' - ' + e.note : '') : h ? hol.get(dayKey(d)) : undefined}>
                          {t ? t.letter : ''}{t && e.hours != null ? <small>{num(e.hours)}h</small> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No support time off recorded for {MONTHS[mo - 1]} {y}.</p>}
        {lowCover.size ? <p className='muted' style={{ marginBottom: 0 }}>Days short of cover: {[...lowCover.entries()].map(([d, t]) => d + ' ' + MONTHS[mo - 1].slice(0, 3) + ' (' + t + ')').join(', ')}</p> : null}
      </div>

      {entries.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Time off in {MONTHS[mo - 1]} ({entries.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Type</th><th>From</th><th>To</th><th>Time off</th><th>Note</th><th>Added by</th>{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className='c-title'><OfficeTag o={e.office} /><b>{e.name}</b></td>
                    <td className='c-meta'><span className='rostag' style={{ background: TINFO[e.kind].color }}>{TINFO[e.kind].label}</span></td>
                    <td className='nw c-meta'>{e.from_date}</td>
                    <td className='nw c-meta'>{e.to_date}</td>
                    <td className='c-meta'>{count(e)}</td>
                    <td className='c-meta'>{e.note || ''}</td>
                    <td className='c-meta'>{e.by_name || '-'}</td>
                    {edit ? (
                      <td className='act'>
                        <form action={deleteTimeOff} className='inline'>
                          <input type='hidden' name='id' value={e.id} />
                          <input type='hidden' name='month' value={month} />
                          <ConfirmButton className='btn ghost' message='Remove this time off?'>Remove</ConfirmButton>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}