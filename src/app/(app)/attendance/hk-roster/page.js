import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { dkDutyMap } from '@/lib/dk-hours';
import { planFor, DEFAULT_PATTERN } from '@/lib/dk-rotation';
import { siteKey } from '@/components/OfficeTag';
import { dkRotations, TYPES, TINFO, addDays, daysIn, validMonth, shiftMonth, monthOff, offToday, comingUp, pendingRequests, hkPeople, upcomingBirthdays, getSettings, holidaysBetween, siteList, WORKING, checkedInDays, dkCheckedInDays, hkInactive, hkHistory } from '@/lib/roster';
import { addTimeOff, deleteTimeOff, addHkPerson, updateHkPerson, decideTimeOff, addDkHoliday, removeDkHoliday } from '@/lib/roster-actions';
import { DeactivateForm, InactiveCard } from '@/components/HkStatus';
import { applyHkDates } from '@/lib/hk-dates';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import ConfirmButton from '@/components/ConfirmButton';
import HkTabs from '@/components/HkTabs';
import { teamOf, TEAM_NAME, TEAM_SHORT, siteText } from '@/lib/teams';
import { siteTag } from '@/lib/dk-sites';
import SiteMap from '@/components/SiteMap';
import { syncDk } from '@/lib/dk-sync';

export const dynamic = 'force-dynamic';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// One letter per weekday keeps the columns narrow; the full day is in the header tooltip.
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const num = (v) => String(Math.round(v * 100) / 100);
const span = (e) => e.from_date + (e.to_date !== e.from_date ? ' to ' + e.to_date : '') + (e.hours != null ? ' (' + num(e.hours) + ' h)' : '');

// Who in the support team is off, and when. Only the Sr. Ops Manager and the Sr. Support Officer see this page.
// forceTeam: the Dastarkhawan section (/dastarkhawan) shows this same page for its own team.
export default async function RosterPage({ searchParams, forceTeam }) {
  const user = await requireUser(ATT_ROLES);
  // The Dastarkhawan section also opens for anyone given the "Dastarkhawan" permission (e.g. a Support Officer); Support stays om/sso only.
  const dastOk = forceTeam === 'dast' && can(user, 'dast_edit');
  if (user.role !== 'om' && user.role !== 'sso' && !dastOk) redirect(forceTeam ? '/' : '/attendance/hk-roster/request');
  const sp = await searchParams;
  if (!forceTeam && sp.team === 'dast') redirect('/dastarkhawan'); // the old address
  await applyHkDates(); // deactivations / re-activations whose date has arrived
  const tm = forceTeam === 'dast' ? 'dast' : 'support';
  const dast = tm === 'dast';
  const base = dast ? '/dastarkhawan' : '/attendance/hk-roster';
  const today = todayKey();
  const month = validMonth(sp.m) ? sp.m : today.slice(0, 7);
  // The time frame: a whole month (default), or any range of days (last week, this week, last 7 days, custom dates; up to about two months).
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const rangeMode = ISO.test(sp.from || '') && ISO.test(sp.to || '') && sp.from <= sp.to && (Date.parse(sp.to) - Date.parse(sp.from)) / 864e5 <= 61;
  const from = rangeMode ? sp.from : month + '-01';
  const to = rangeMode ? sp.to : month + '-' + String(daysIn(month)).padStart(2, '0');
  const nDays = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const dates = Array.from({ length: nDays }, (_, i) => addDays(from, i));
  const mondayOf = (key) => addDays(key, 1 - (new Date(key + 'T00:00:00Z').getUTCDay() || 7));
  const shortDay = (k) => Number(k.slice(8)) + ' ' + MONTHS[Number(k.slice(5, 7)) - 1].slice(0, 3) + (k.slice(0, 4) !== today.slice(0, 4) ? ' ' + k.slice(0, 4) : '');
  const edit = can(user, dast ? 'dast_edit' : 'roster_edit');
  const both = allOffices(user);
  // The Support team is filtered by office; the Dastarkhawan team by site (APL, LHR, OKA, ISB).
  const office = dast ? '' : both ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const SITES = dast ? await siteList() : []; // the sites you manage on the Sites tab
  const site = dast && SITES.includes(sp.site) ? sp.site : '';
  const who = String(sp.who || '').trim().slice(0, 60);
  // The whole team is shown by default; "only people with time-off" is the option.
  const onlyOff = sp.only === '1';
  const everyone = !onlyOff;
  const [y, mo] = from.slice(0, 7).split('-').map(Number);
  const rangeLabel = rangeMode ? shortDay(from) + ' to ' + shortDay(to) : MONTHS[mo - 1] + ' ' + y;
  // The tag next to a name: the office (Support), or the site (Dastarkhawan: "4 sites" when mapped to several).
  const tag = (p) => (dast ? siteTag((p.sites || []).map((x) => x.site), SITES) || p.site || '' : p.office);

  const entries = await monthOff({ month, from, to, office, who, team: tm, site });
  const team = await hkPeople({ office, team: tm, site });
  const rots = dast ? await dkRotations() : new Map(); // incharges who rotate between sites
  const dutyMap = dast ? await dkDutyMap() : new Map(); // people whose duty day is not the usual 8 hours
  const people = everyone ? await hkPeople({ office, who, team: tm, site }) : [];
  // Live link with attendance: on every day up to today, anyone who checked in (and has no time-off) shows W (worked).
  const checked = from <= today ? await checkedInDays(from, to < today ? to : today) : new Map();
  // Dastarkhawan has two sources for W: OpsTrack's own attendance entries (matched by name, above) and the facial attendance app
  // (linked by staff ID; refreshed at most every 5 minutes). A W counts if either has a check in; hovering a W says which.
  let dkDays = new Map();
  if (dast) {
    await syncDk();
    if (from <= today) dkDays = await dkCheckedInDays(from, to < today ? to : today);
  }
  const byId = new Map(team.map((p) => [p.id, p]));
  const rows = everyone ? people : [...new Map(entries.map((e) => [e.staff_id, byId.get(e.staff_id) || { id: e.staff_id, name: e.name, dept: e.dept, office: e.office, site: e.site, sites: [] }])).values()];
  const settings = await getSettings();
  const hol = await holidaysBetween(from, to, tm);
  // Dastarkhawan has no gazetted calendar: its holidays are added by hand (listed for the year being viewed).
  const holYear = from.slice(0, 4);
  const dkHol = dast && edit ? [...(await holidaysBetween(holYear + '-01-01', holYear + '-12-31', 'dast')).entries()] : [];
  const inactive = edit ? await hkInactive(tm) : [];
  const hist = edit ? await hkHistory(tm) : [];
  const off = await offToday(today, office, tm, site);
  // "Coming up" is time-off that starts after today; anyone off today is already counted under "Off today".
  const coming = (await comingUp(today, 14, office, tm, site)).filter((e) => e.from_date > today);
  const pending = edit ? await pendingRequests(office, tm, site) : [];
  const birthdays = upcomingBirthdays(team, today, 30);
  const names = team.map((p) => p.name);

  const grid = new Map();
  for (const e of entries) {
    if (!grid.has(e.staff_id)) grid.set(e.staff_id, {});
    for (const key of dates) {
      if (key >= e.from_date && key <= e.to_date) {
        const cur = grid.get(e.staff_id)[key];
        if (!cur) grid.get(e.staff_id)[key] = { ...e };
        else if (e.hours != null && cur.hours != null && cur.kind === e.kind) cur.hours += e.hours;
      }
    }
  }

  // Cover check: a day is flagged when fewer people are in than the minimum set for an office.
  const lowCover = new Map();
  for (const code of dast ? [] : ['LHR', 'ISB']) {
    const min = settings['min_' + code];
    const size = team.filter((p) => p.office === code).length;
    if (!(min > 0) || !size || (office && office !== code)) continue;
    for (const key of dates) {
      if (hol.has(key)) continue;
      const out = new Set(entries.filter((e) => e.office === code && e.hours == null && key >= e.from_date && key <= e.to_date).map((e) => e.staff_id)).size;
      if (size - out < min) lowCover.set(key, (lowCover.get(key) ? lowCover.get(key) + '; ' : '') + code + ': ' + (size - out) + ' in, ' + min + ' needed');
    }
  }

  // Links keep the time frame (a month, or from..to) and the filters. Empty values are left out.
  const qp = (extra = {}) => {
    const p = { ...(rangeMode ? { from, to } : { m: month }), ...(site ? { site } : {}), ...(office && both ? { office } : {}), ...(who ? { who } : {}), ...(onlyOff ? { only: '1' } : {}), ...extra };
    return new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v != null))).toString();
  };
  const wd = (key) => new Date(key + 'T00:00:00Z').getUTCDay();
  const wk0 = mondayOf(today);
  const QUICK = [['Last week', addDays(wk0, -7), addDays(wk0, -1)], ['This week', wk0, addDays(wk0, 6)], ['Last 7 days', addDays(today, -6), today]];
  const monthLink = (m) => base + '?' + qp({ m, from: '', to: '' });
  const count = (e) => (e.hours != null ? num(e.hours) + ' h' : String(Math.round((new Date(e.to_date) - new Date(e.from_date)) / 864e5) + 1) + ' day(s)');

  return (
    <>
      <div className='head rosthead'>
        <h1>{TEAM_NAME[tm]}</h1>
        <a href={base + '/xlsx?' + qp()} className='btn primary'>Download Excel (.xlsx)</a>
        <p className='muted'>Who in the {TEAM_SHORT[tm]} team will be off, and when (full days or a number of hours){dast ? ', with the site and joining date of each person' : ''}. Only the Sr. Ops Manager and the Sr. Support Officer can see and change it.</p>
      </div>
      <HkTabs active='roster' team={tm} />
      <Flash sp={sp} />

      <div className='card rosnav'>
        {rangeMode ? (
          <>
            <Link className='btn' href={base + '?' + qp({ from: addDays(from, -nDays), to: addDays(from, -1) })}>&lt; Earlier</Link>
            <b>{rangeLabel}</b>
            <Link className='btn' href={base + '?' + qp({ from: addDays(to, 1), to: addDays(to, nDays) })}>Later &gt;</Link>
          </>
        ) : (
          <>
            <Link className='btn' href={monthLink(shiftMonth(month, -1))}>&lt; {MONTHS[(mo + 10) % 12]}</Link>
            <b>{rangeLabel}</b>
            <Link className='btn' href={monthLink(shiftMonth(month, 1))}>{MONTHS[mo % 12]} &gt;</Link>
          </>
        )}
        {QUICK.map(([label, a, b]) => (
          <Link key={label} className={'btn ' + (rangeMode && from === a && to === b ? 'primary' : 'ghost')} href={base + '?' + qp({ from: a, to: b })}>{label}</Link>
        ))}
        <Link className={'btn ' + (!rangeMode && month === today.slice(0, 7) ? 'primary' : 'ghost')} href={monthLink(today.slice(0, 7))}>This month</Link>
        {dast ? (
          <AutoFilters
            hidden={{ ...(rangeMode ? { from, to } : { m: month }), who, only: onlyOff ? '1' : '' }}
            fields={[{ name: 'site', label: 'Site', value: site, options: [['', 'All sites'], ...SITES.map((x) => [x, x])] }]}
          />
        ) : both ? (
          <AutoFilters
            hidden={{ ...(rangeMode ? { from, to } : { m: month }), who, only: onlyOff ? '1' : '' }}
            fields={[{ name: 'office', label: 'Office', value: office, options: [['', 'Both offices'], ['LHR', 'LHR'], ['ISB', 'ISB']] }]}
          />
        ) : null}
        <form method='get' className='rosrange'>
          {Object.entries({ ...(site ? { site } : {}), ...(office && both ? { office } : {}), ...(who ? { who } : {}), ...(onlyOff ? { only: '1' } : {}) }).map(([k, v]) => <input key={k} type='hidden' name={k} value={v} />)}
          <label>From<input type='date' name='from' defaultValue={from} required /></label>
          <label>To<input type='date' name='to' defaultValue={to} required /></label>
          <button className='btn' type='submit'>Show</button>
        </form>
      </div>

      <div className='card'>
        <div className='roslegend'>
          {(dast ? TYPES.filter(([k]) => k === 'pto') : TYPES).map(([k, l, letter, color]) => <span key={k}><i className={'rk-' + k} style={{ background: color }}>{dast && k === 'pto' ? 'L' : letter}</i>{dast && k === 'pto' ? 'PTO (Leave)' : l}</span>)}
          <span><i className='hollegend'>H</i>Holiday</span>
          <span><i className='rk-w' style={{ background: WORKING.color }}>{WORKING.letter}</i>Worked (checked in{dast ? ': facial app or OpsTrack attendance, hover to see which' : ''})</span>
          <Link href={base + '?' + qp({ only: onlyOff ? '' : '1' })} className='rosall'>{onlyOff ? 'Show the whole team' : 'Show only people with time-off'}</Link>
        </div>
        {rows.length ? (
          <div className='rostable'>
            <table className='rost'>
              <thead>
                <tr>
                  <th className='rn'>Team member</th>
                  {dates.map((key) => <th key={key} className={(wd(key) === 0 || wd(key) === 6 ? 'we ' : '') + (hol.has(key) ? 'hol ' : '') + (lowCover.has(key) ? 'lowcov ' : '') + (key === today ? 'tod' : '')} title={[shortDay(key), hol.get(key), lowCover.get(key)].filter(Boolean).join(' | ')}>{Number(key.slice(8))}<small>{DOW[wd(key)]}</small></th>)}
                  <th className='rsum' title='Days with a check in'>Worked</th>
                  <th className='rsum' title='Full days of time-off'>Off</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  let worked = 0;
                  let offDays = 0;
                  const lname = String(p.name).toLowerCase();
                  const cells = dates.map((key) => {
                    const e = (grid.get(p.id) || {})[key];
                    const t = e ? TINFO[e.kind] : null;
                    const h = hol.has(key);
                    // Checked in that day and no time-off: worked (W).
                    const inApp = !!checked.get(key) && checked.get(key).has(lname);
                    const inDk = !!dkDays.get(key) && dkDays.get(key).has(lname);
                    const w = !t && key <= today && (inApp || inDk);
                    const plan = !t ? planFor(rots.get(p.id), key) : null; // where the rotation puts this person that day
                    const src = inApp && inDk ? 'facial app and OpsTrack attendance' : inDk ? 'facial app' : 'OpsTrack attendance';
                    if (w) worked += 1;
                    if (t && e.hours == null) offDays += 1;
                    return (
                      <td key={key} className={(wd(key) === 0 || wd(key) === 6 ? 'we ' : '') + (h && !t && !w ? 'hol ' : '') + (t ? 'rk-' + e.kind : plan ? 'rot ' + (plan.site === 'T' ? 'rot-t' : 'rot-' + siteKey(plan.site)) : w ? 'rk-w' : '')} style={t ? { background: t.color } : plan ? undefined : w ? { background: WORKING.color } : undefined} title={e ? p.name + ': ' + t.label + ' ' + e.from_date + (e.to_date !== e.from_date ? ' to ' + e.to_date : '') + (e.note ? ' - ' + e.note : '') : plan ? p.name + ', ' + shortDay(key) + ': planned ' + (plan.site === 'T' ? 'travel-only day' : plan.site) + (w ? ' (checked in)' : '') : w ? p.name + ': ' + WORKING.label + ', ' + shortDay(key) + (dast ? ' (from the ' + src + ')' : '') : h ? hol.get(key) : undefined}>
                        {t ? (dast && e.kind === 'pto' ? 'L' : t.letter) : plan ? plan.site : w ? WORKING.letter : dast && h ? 'H' : ''}{t && e.hours != null ? <small>{num(e.hours)}h</small> : null}
                      </td>
                    );
                  });
                  return (
                    <tr key={p.id}>
                      <td className='rn' title={dast ? siteText(p.sites) : undefined}><OfficeTag o={tag(p)} /><b>{p.name}</b>{p.dept ? <small className='muted'> {p.dept}</small> : null}</td>
                      {cells}
                      <td className='rsum'>{worked || '-'}</td>
                      <td className='rsum'>{offDays || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No {TEAM_SHORT[tm]} time-off recorded for {rangeLabel}.</p>}
        {lowCover.size ? <p className='muted' style={{ marginBottom: 0 }}>Days short of cover: {[...lowCover.entries()].map(([k, t]) => shortDay(k) + ' (' + t + ')').join(', ')}</p> : null}
      </div>


      <div className='kpis'>
        <div className='card kpi'><span>Off today</span><b>{off.length}</b><small>{off.length ? off.slice(0, 6).map((e) => e.name).join(', ') + (off.length > 6 ? ' ...' : '') : 'Everyone is expected in'}</small></div>
        <div className='card kpi alt'><span>People off in {rangeMode ? 'this period' : MONTHS[mo - 1]}</span><b>{new Set(entries.map((e) => e.staff_id)).size}</b></div>
        {dast ? (
          <div className='card kpi alt'><span>Team members</span><b>{team.length}</b><small>{SITES.map((x) => x + ' ' + team.filter((p) => (p.sites || []).some((m) => m.site === x)).length).join(' · ')}</small></div>
        ) : (
          <div className={'card kpi alt' + (lowCover.size ? ' neg' : '')}><span>Days short of cover</span><b>{lowCover.size}</b><small>{lowCover.size ? 'Marked in red on the grid' : 'Set a minimum in Setup'}</small></div>
        )}
        <div className={'card kpi alt' + (pending.length ? ' neg' : '')}><span>Requests waiting</span><b>{pending.length}</b></div>
      </div>

      {pending.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Time-off requests ({pending.length})</h3>
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
                      {user.role === 'om' ? (
                        <form action={decideTimeOff} className='inline'>
                          <input type='hidden' name='id' value={e.id} />
                          <button name='decision' value='approve' className='btn ok' type='submit'>Approve</button>
                          <button name='decision' value='decline' className='btn bad' type='submit'>Decline</button>
                        </form>
                      ) : <span className='muted'>Waiting for Mohsin</span>}
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
        <details className='card'>
          <summary>Add time-off</summary>
          <form action={addTimeOff} className='form'>
            <input type='hidden' name='month' value={month} />
            <input type='hidden' name='team' value={tm} />
            <label>Team member<input name='name' list='ros-names' placeholder='Type a name' required autoComplete='off' /></label>
            <datalist id='ros-names'>{names.map((nm) => <option key={nm} value={nm} />)}</datalist>
            <label>Type<select name='kind' defaultValue='pto'>{(dast ? TYPES.filter(([k]) => k === 'pto') : TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label>First day<input type='date' name='from' defaultValue={today} required /></label>
            <label>Last day<input type='date' name='to' defaultValue={today} required /></label>
            <label className='span3'>Note (optional)<input name='note' maxLength={120} placeholder='For example: family wedding' /></label>
            <label>Hours (only for part of a day)<input type='number' name='hours' min='0.25' max='24' step='0.25' placeholder='Leave empty for full days' /></label>
            <button className='btn primary' type='submit'>Add time-off</button>
          </form>
        </details>
      ) : null}

      {edit && !dast ? (
        <details className='card'>
          <summary>Add team member</summary>
          <form action={addHkPerson} className='form'>
            <input type='hidden' name='team' value={tm} />
            <label>Name<input name='name' required maxLength={80} placeholder='Team member name' autoComplete='off' /></label>
            <label>Role (optional)<input name='role' maxLength={60} placeholder={dast ? 'For example: cook, helper' : 'For example: cleaner, office boy'} /></label>
            <label>Phone<input name='phone' type='tel' maxLength={30} placeholder='03xx xxxxxxx' /></label>
            <label>Joining date<input type='date' name='joined' /></label>
            <label>Birthday<input type='date' name='birthday' /></label>
            {dast ? <SiteMap sites={SITES} /> : both ? <label>Office<select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select></label> : null}
            <button className='btn primary' type='submit'>Add team member</button>
          </form>
        </details>
      ) : null}

      {edit ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>{TEAM_SHORT[tm]} team ({team.length})</h3>
          {team.length ? (
            <div className='tablewrap' style={{ marginTop: 10 }}>
              <table className='tx'>
                <thead><tr><th>Name</th>{dast ? <th>Site</th> : null}<th>Role</th><th>Phone</th><th>Joined</th><th>Birthday</th><th></th></tr></thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id}>
                      <td className='c-title'><OfficeTag o={tag(p)} /><b>{p.name}</b>{p.active_to ? <small className='dkp-diff'> leaving w.e.f. {p.active_to}</small> : null}</td>
                      {dast ? <td className='c-meta'>{siteText(p.sites) || p.site || '-'}</td> : null}
                      <td className='c-meta'>{p.dept || '-'}</td>
                      <td className='c-meta'>{p.phone ? <a href={'tel:' + p.phone}>{p.phone}</a> : '-'}</td>
                      <td className='nw c-meta'>{p.joined_on || '-'}</td>
                      <td className='nw c-meta'>{p.birthday ? p.birthday.slice(5) : '-'}</td>
                      <td className='act'>
                        <div className='entry-act'>
                        <details className='entry-edit'>
                          <summary className='btn'>Edit</summary>
                          <form action={updateHkPerson} className='entry-edit-form'>
                            <input type='hidden' name='id' value={p.id} />
                            <label>Name<input name='name' defaultValue={p.name} maxLength={80} required /></label>
                            <label>Role<input name='role' defaultValue={p.dept || ''} maxLength={60} /></label>
                            <label>Phone<input name='phone' defaultValue={p.phone || ''} maxLength={30} /></label>
                            <label>Joining date<input type='date' name='joined' defaultValue={p.joined_on || ''} /></label>
                            <label>Birthday<input type='date' name='birthday' defaultValue={p.birthday || ''} /></label>
                            {dast ? <label>Duty hours a day<input type='number' name='duty' min='1' max='24' step='0.5' defaultValue={(dutyMap.get(p.id) || 480) / 60} /></label> : null}
                            {dast && (p.sites || []).length > 1 ? (
                              <fieldset className='rot-set'>
                                <legend>Site rotation</legend>
                                <input type='hidden' name='rot_present' value='1' />
                                <label className='rot-on'><input type='checkbox' name='rot_on' value='1' defaultChecked={rots.has(p.id)} /> Follow a rotation</label>
                                <label>Day 1 is<input type='date' name='rot_start' defaultValue={rots.has(p.id) ? rots.get(p.id).start : today.slice(0, 7) + '-01'} /></label>
                                <label className='rot-pat'>Pattern: site code and days, T = travel-only day<input name='rot_pattern' defaultValue={rots.has(p.id) ? rots.get(p.id).pattern : DEFAULT_PATTERN} maxLength={200} /></label>
                              </fieldset>
                            ) : null}
                            {dast ? <SiteMap sites={SITES} selected={p.sites} /> : null}
                            <button className='btn primary' type='submit'>Save</button>
                          </form>
                        </details>
                        <DeactivateForm p={p} today={today} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {edit ? <InactiveCard rows={inactive} history={hist} today={today} /> : null}

      {dast && edit ? (
        <details className='card'>
          <summary>Dastarkhawan holidays in {holYear} ({dkHol.length})</summary>
          <p className='muted'>There is no gazetted calendar for the Dastarkhawan team. Add a holiday here when there is one; it is shaded on the roster and not counted as time-off.</p>
          <form action={addDkHoliday} className='form'>
            <label>Date<input type='date' name='day' defaultValue={today} required /></label>
            <label>Holiday name<input name='name' maxLength={80} required placeholder='For example: Eid holiday' autoComplete='off' /></label>
            <button className='btn primary' type='submit'>Add holiday</button>
          </form>
          {dkHol.length ? (
            <ul className='hk-hist'>
              {dkHol.map(([d, n]) => (
                <li key={d}>
                  <span className='nw'>{d}</span>
                  <b>{n}</b>
                  <form action={removeDkHoliday} className='inline'>
                    <input type='hidden' name='day' value={d} />
                    <ConfirmButton className='btn ghost' message={'Remove the holiday ' + n + ' (' + d + ')?'}>Remove</ConfirmButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : <p className='muted'>No holidays added for {holYear}.</p>}
        </details>
      ) : null}

      {entries.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Time-off in {rangeLabel} ({entries.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Type</th><th>From</th><th>To</th><th>Time-off</th><th>Note</th><th>Added by</th>{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className='c-title'><OfficeTag o={dast ? tag(byId.get(e.staff_id) || { sites: [], site: e.site }) : e.office} /><b>{e.name}</b></td>
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
                          <input type='hidden' name='team' value={tm} />
                          <ConfirmButton className='btn ghost' message='Remove this time-off?'>Remove</ConfirmButton>
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
