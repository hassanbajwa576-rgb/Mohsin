import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TYPES, TINFO, daysIn, validMonth, shiftMonth, monthOff, offToday, hkPeople } from '@/lib/roster';
import { addTimeOff, deleteTimeOff, addHkPerson, removeHkPerson } from '@/lib/roster-actions';
import Flash from '@/components/Flash';
import HkTabs from '@/components/HkTabs';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Who is off and when: a monthly grid of time off. Everyone sees their office; people with Roster access add and remove time off.
export default async function RosterPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (user.role !== 'om' && user.role !== 'sso') redirect('/attendance');
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
  const grid = new Map();
  for (const e of entries) {
    if (!grid.has(e.staff_id)) grid.set(e.staff_id, {});
    for (let d = 1; d <= n; d++) {
      const key = month + '-' + String(d).padStart(2, '0');
      if (key >= e.from_date && key <= e.to_date) {
        const cur = grid.get(e.staff_id)[d];
        if (!cur) grid.get(e.staff_id)[d] = { ...e };
        else if (e.hours != null && cur.hours != null && cur.kind === e.kind) cur.hours += e.hours;
      }
    }
  }
  const names = team.map((p) => p.name);
  const off = await offToday(today, office);
  const qp = (extra = {}) => new URLSearchParams({ m: month, ...(office && both ? { office } : {}), ...(who ? { who } : {}), ...(everyone ? { all: '1' } : {}), ...extra }).toString();
  const days = Array.from({ length: n }, (_, i) => i + 1);
  const wd = (d) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const count = (e) => (e.hours != null ? String(Math.round(e.hours * 100) / 100) + ' h' : String(Math.round((new Date(e.to_date) - new Date(e.from_date)) / 864e5) + 1) + ' day(s)');

  return (
    <>
      <div className='head'>
        <div>
          <h1>Housekeeping Roster</h1>
          <p className='muted'>Who in the housekeeping team will be off, and when (full days or a number of hours). Only the Sr. Ops Manager and the Sr. Support Officer can see and change it.</p>
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
        <div className='card kpi alt'><span>Entries this month</span><b>{entries.length}</b></div>
      </div>

      {edit ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Add time off</h3>
          <form action={addTimeOff} className='form'>
            <input type='hidden' name='month' value={month} />
            <label>Team member<input name='name' list='ros-names' placeholder='Type a name' required autoComplete='off' /></label>
            <datalist id='ros-names'>{names.map((nm) => <option key={nm} value={nm} />)}</datalist>
            <label>Type<select name='kind' defaultValue='annual'>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>First day<input type='date' name='from' defaultValue={today} required /></label>
            <label>Last day<input type='date' name='to' defaultValue={today} required /></label>
            <label>Hours (only for part of a day)<input type='number' name='hours' min='0.25' max='24' step='0.25' placeholder='Leave empty for full days' /></label>
            <label className='wide'>Note (optional)<input name='note' maxLength={120} placeholder='For example: family wedding' /></label>
            <button className='btn primary' type='submit'>Add time off</button>
          </form>
        </div>
      ) : null}

      {edit ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Housekeeping team ({team.length})</h3>
          <form action={addHkPerson} className='form'>
            <label>Name<input name='name' required maxLength={80} placeholder='Team member name' autoComplete='off' /></label>
            <label>Role (optional)<input name='role' maxLength={60} placeholder='For example: cleaner, office boy' /></label>
            {both ? <label>Office<select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select></label> : null}
            <button className='btn primary' type='submit'>Add to the Housekeeping team</button>
          </form>
          {team.length ? (
            <div className='tablewrap' style={{ marginTop: 10 }}>
              <table className='tx'>
                <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id}>
                      <td className='c-title'><OfficeTag o={p.office} /><b>{p.name}</b></td>
                      <td className='c-meta'>{p.dept || '-'}</td>
                      <td className='act'>
                        <form action={removeHkPerson} className='inline'>
                          <input type='hidden' name='id' value={p.id} />
                          <ConfirmButton className='btn ghost' message='Remove this person from the Housekeeping team?'>Remove</ConfirmButton>
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
        <Link className='btn' href={'/attendance/hk-roster?' + new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qp())), m: shiftMonth(month, -1) }).toString()}>&lt; {MONTHS[(mo + 10) % 12]}</Link>
        <b>{MONTHS[mo - 1]} {y}</b>
        <Link className='btn' href={'/attendance/hk-roster?' + new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qp())), m: shiftMonth(month, 1) }).toString()}>{MONTHS[mo % 12]} &gt;</Link>
        <Link className='btn ghost' href={'/attendance/hk-roster?' + new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qp())), m: today.slice(0, 7) }).toString()}>This month</Link>
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
          <Link href={'/attendance/hk-roster?' + qp({ all: everyone ? '' : '1' })} className='rosall'>{everyone ? 'Show only people with time off' : 'Show the whole team'}</Link>
        </div>
        {rows.length ? (
          <div className='rostable'>
            <table className='rost'>
              <thead>
                <tr>
                  <th className='rn'>Team member</th>
                  {days.map((d) => <th key={d} className={(wd(d) === 0 || wd(d) === 6 ? 'we ' : '') + (month + '-' + String(d).padStart(2, '0') === today ? 'tod' : '')}>{d}<small>{DOW[wd(d)]}</small></th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className='rn'><OfficeTag o={p.office} /><b>{p.name}</b>{p.dept ? <small className='muted'> {p.dept}</small> : null}</td>
                    {days.map((d) => {
                      const e = (grid.get(p.id) || {})[d];
                      const t = e ? TINFO[e.kind] : null;
                      return (
                        <td key={d} className={wd(d) === 0 || wd(d) === 6 ? 'we' : ''} style={t ? { background: t.color } : undefined} title={e ? p.name + ': ' + t.label + ' ' + e.from_date + (e.to_date !== e.from_date ? ' to ' + e.to_date : '') + (e.note ? ' - ' + e.note : '') : undefined}>
                          {t ? t.letter : ''}{t && e.hours != null ? <small>{String(Math.round(e.hours * 100) / 100)}h</small> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No Housekeeping time off recorded for {MONTHS[mo - 1]} {y}.</p>}
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