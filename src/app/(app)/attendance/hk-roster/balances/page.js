import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TYPES, ALLOWED, hkPeople, usedByPerson, getSettings, siteList, dkAllowDetail, dkTakenMonthly, dkAutoSetting } from '@/lib/roster';
import { setDkAllowance, setDkAllowanceAll, saveDkMonthly, setDkMonthlyAll, saveDkTaken, importMonthlyLeaves, setDkAuto } from '@/lib/roster-actions';
import LeaveImport from '@/components/LeaveImport';
import { applyHkDates } from '@/lib/hk-dates';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import HkTabs from '@/components/HkTabs';
import { TEAM_SHORT } from '@/lib/teams';
import { siteTag } from '@/lib/dk-sites';
import NavOffset from '@/components/NavOffset';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

const d1 = (v) => String(Math.round(v * 10) / 10);

// Leave balances and the yearly summary: days off per person and per type, against the yearly allowance set in Setup.
// forceTeam: the Dastarkhawan section (/dastarkhawan/balances) shows this same page for its own team.
// How a person's allocation is made up, in small text under the number: yearly, monthly, or both; months given ahead are shown separately.
const basis = (d, monthSum) => {
  if (!d) return null;
  const parts = [];
  if (d.hasAnnual && d.annual) parts.push('yearly ' + d1(d.annual));
  const doneM = d.sofar - (d.annual || 0) - (d.autoSum || 0);
  if (doneM) parts.push('monthly ' + d1(doneM));
  if (d.autoSum) parts.push('automatic ' + d1(d.autoSum));
  const later = d.total - d.sofar;
  return (
    <>
      {parts.length ? <small className='muted'> ({parts.join(' + ')})</small> : null}
      {later > 0 ? <small className='muted'> +{d1(later)} for later months</small> : null}
    </>
  );
};

// Left badge colour: over = red, 5 or fewer left = yellow, more than 5 = green.
const lvTone = (left) => (left < 0 ? 'bad' : left <= 5 ? 'warn' : 'ok');

export default async function BalancesPage({ searchParams, forceTeam }) {
  const user = await requireUser(ATT_ROLES);
  const dastOk = forceTeam === 'dast' && can(user, 'dast_edit');
  if (user.role !== 'om' && user.role !== 'sso' && !dastOk) redirect(forceTeam ? '/' : '/attendance/hk-roster/request');
  const sp = await searchParams;
  if (!forceTeam && sp.team === 'dast') redirect('/dastarkhawan/balances'); // the old address
  await applyHkDates();
  const thisYear = Number(todayKey().slice(0, 4));
  const year = /^\d{4}$/.test(sp.y || '') ? Number(sp.y) : thisYear;
  const both = allOffices(user);
  const tm = forceTeam === 'dast' ? 'dast' : 'support';
  const dast = tm === 'dast';
  const base = dast ? '/dastarkhawan/balances' : '/attendance/hk-roster/balances';
  const office = dast ? '' : both ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const SITES = dast ? await siteList() : [];
  const site = dast && SITES.includes(sp.site) ? sp.site : '';
  const team = await hkPeople({ office, team: tm, site });
  const used = await usedByPerson(year, office, tm, site);
  const set = await getSettings();
  const allow = dast ? await dkAllowDetail(year) : new Map();
  const taken = dast ? await dkTakenMonthly(year) : new Map();
  const auto = dast ? await dkAutoSetting() : null;
  const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const editDk = dast && can(user, 'dast_edit');
  const yq = (y) => base + '?' + new URLSearchParams({ y: String(y), ...(site ? { site } : {}), ...(office && both ? { office } : {}) }).toString();
  const totals = Object.fromEntries(TYPES.map(([k]) => [k, team.reduce((a, p) => a + ((used.get(p.id) || {})[k] || 0), 0)]));
  const anySet = ALLOWED.some((k) => set[k] > 0);

  return (
    <>
      <div className='head'>
        <div>
          <h1>{dast ? 'Dastarkhawan Leaves' : TEAM_SHORT[tm] + ' Time-off Balance'}</h1>
          <p className='muted'>Days off used in {year} against the yearly allowance. Hours count as part of a day ({set.hpd} hours = 1 day) and holidays are not counted. Allowances do not carry forward.</p>
        </div>
      </div>
      <HkTabs active='balances' team={tm} />
      <Flash sp={sp} />
      <div className='card rosnav'>
        <Link className='btn' href={yq(year - 1)}>&lt; {year - 1}</Link>
        <b>{year}</b>
        <Link className='btn' href={yq(year + 1)}>{year + 1} &gt;</Link>
        {year !== thisYear ? <Link className='btn ghost' href={yq(thisYear)}>This year</Link> : null}
      </div>
      {dast ? <AutoFilters hidden={{ y: String(year) }} fields={[{ name: 'site', label: 'Site', value: site, options: [['', 'All sites'], ...SITES.map((x) => [x, x])] }]} /> : both ? <AutoFilters hidden={{ y: String(year) }} fields={[{ name: 'office', label: 'Office', value: office, options: [['', 'Both offices'], ['LHR', 'LHR'], ['ISB', 'ISB']] }]} /> : null}
      {dast ? (
        <p className='muted'>For the Dastarkhawan team only PTO applies. Give each person PTO as a yearly number, month by month, or both (they add up). The days used come from the time-off recorded on the roster; "Left" is what has been given so far minus what was used.</p>
      ) : !anySet ? <p className='muted'>No yearly allowance is set yet, so only the days used are shown. Set them on the Setup tab of the Support team.</p> : null}

      {dast && editDk ? (
        <form action={setDkAllowanceAll} className='card filters'>
          <input type='hidden' name='year' value={year} />
          <label>Same PTO for everyone in {year} (days)<input type='number' name='days' min='0' max='365' step='0.5' placeholder='For example: 14' required /></label>
          <button className='btn' type='submit'>Apply to all</button>
          <span className='muted'>You can still change each person below.</span>
        </form>
      ) : null}

      {dast && editDk ? (
        <form action={setDkAuto} className='card filters'>
          <label>Automatic PTO a month, for everyone (days)<input type='number' name='days' min='0.5' max='31' step='0.5' placeholder='For example: 4' defaultValue={auto ? auto.days : ''} /></label>
          <label>Starting from<input type='month' name='from' defaultValue={auto ? auto.from : thisYear + '-' + String(new Date().getMonth() + 1).padStart(2, '0')} /></label>
          <button className='btn' type='submit'>{auto ? 'Update' : 'Turn on'}</button>
          {auto ? <button className='btn ghost' type='submit' name='off' value='1'>Turn off</button> : null}
          <span className='muted'>{auto ? 'On: ' + d1(auto.days) + ' days every month from ' + auto.from + ', counted when the month arrives and from the month a person joined. ' : ''}Where a month needs a different number, type it in the month grid below; that replaces the automatic number for that month.</span>
        </form>
      ) : null}

      {dast && editDk ? (
        <details className='card'>
          <summary>Give PTO month by month ({year})</summary>
          <p className='muted' style={{ margin: '8px 0' }}>For example 2 days every month. Monthly days add to the yearly number, and "Left" counts the months up to the current one, so leave given for later months is not available yet. Leave a month empty to give nothing for it.</p>
          <form action={setDkMonthlyAll} className='filters'>
            <input type='hidden' name='year' value={year} />
            <label>Days a month, for everyone<input type='number' name='days' min='0' max='31' step='0.5' placeholder='For example: 2' required /></label>
            <label>From
              <select name='from' defaultValue='1'>{MON3.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </label>
            <button className='btn' type='submit'>Give to everyone</button>
            <span className='muted'>to December. You can change single months below.</span>
          </form>
          <form action={saveDkMonthly}>
            <input type='hidden' name='year' value={year} />
            <input type='hidden' name='ids' value={team.map((p) => p.id).join(',')} />
            <div className='mgrid-wrap'>
              <table className='mgrid'>
                <thead><tr><th className='n'>Team member</th>{MON3.map((m) => <th key={m}>{m}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {team.map((p) => {
                    const d = allow.get(p.id);
                    const mo = d ? d.monthly : Array(12).fill(null);
                    return (
                      <tr key={p.id}>
                        <td className='n'><b>{p.name}</b></td>
                        {MON3.map((m, i) => <td key={m}><input type='number' name={'m_' + p.id + '_' + (i + 1)} min='0' max='31' step='0.5' defaultValue={mo[i] == null ? '' : mo[i]} placeholder={d && d.auto[i] != null ? String(d.auto[i]) : ''} aria-label={p.name + ' ' + m} /></td>)}
                        <td><b>{d1(mo.reduce((a, v) => a + (v || 0), 0))}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className='btn primary' type='submit' style={{ marginTop: 10 }}>Save monthly PTO</button>
          </form>
        </details>
      ) : null}

      {dast && editDk ? (
        <details className='card'>
          <summary>Leaves taken by month ({year})</summary>
          <p className='muted' style={{ margin: '8px 0' }}>Leave taken in each month when there are no dates to enter on the roster (for example from the paper register). These days count as PTO used. Leave a month empty for none.</p>
          <form action={saveDkTaken}>
            <input type='hidden' name='year' value={year} />
            <input type='hidden' name='ids' value={team.map((p) => p.id).join(',')} />
            <div className='mgrid-wrap'>
              <table className='mgrid'>
                <thead><tr><th className='n'>Team member</th>{MON3.map((m) => <th key={m}>{m}</th>)}<th>Total</th></tr></thead>
                <tbody>
                  {team.map((p) => {
                    const t = taken.get(p.id) || Array(12).fill(null);
                    return (
                      <tr key={p.id}>
                        <td className='n'><b>{p.name}</b></td>
                        {MON3.map((m, i) => <td key={m}><input type='number' name={'t_' + p.id + '_' + (i + 1)} min='0' max='31' step='0.5' defaultValue={t[i] == null ? '' : t[i]} aria-label={p.name + ' taken ' + m} /></td>)}
                        <td><b>{d1(t.reduce((a, v) => a + (v || 0), 0))}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className='btn primary' type='submit' style={{ marginTop: 10 }}>Save leaves taken</button>
          </form>
        </details>
      ) : null}

      {dast && editDk ? (
        <details className='card'>
          <summary>Paste monthly figures ({year})</summary>
          <p className='muted' style={{ margin: '8px 0' }}>Import PTO given or leave taken for any months, for example from a paper register or a spreadsheet, now or later. Check the preview, then import.</p>
          <LeaveImport people={team.map((p) => ({ id: p.id, name: p.name }))} year={year} action={importMonthlyLeaves} />
        </details>
      ) : null}

      {dast ? (
        <div className='card'>
          <NavOffset />
          {team.length ? (
            <div className='tablewrap dk-sticky'>
              <table className='tx dka-lv dkt dkt-fit'>
                <thead>
                  <tr><th>Team member</th><th className='r'>Yearly / extra</th><th className='r' title='Yearly number plus the months given up to now. This is what the balance is counted from.'>Allocated</th><th className='r'>Used</th><th className='r'>Left</th></tr>
                </thead>
                <tbody>
                  {team.map((p) => {
                    const v = (used.get(p.id) || {}).pto || 0;
                    const d = allow.get(p.id);
                    const sofar = d ? d.sofar : null;
                    const left = sofar == null ? null : sofar - v;
                    const monthSum = d ? d.monthly.reduce((a, x) => a + (x || 0), 0) : 0;
                    const takenSum = (taken.get(p.id) || []).reduce((a, x) => a + (x || 0), 0);
                    return (
                      <tr key={p.id}>
                        <td className='c-title'><OfficeTag o={siteTag((p.sites || []).map((x) => x.site), SITES) || p.site || ''} /><b>{p.name}</b></td>
                        <td className='r nw c-meta'>
                          {editDk ? (
                            <form action={setDkAllowance} className='inline' style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                              <input type='hidden' name='id' value={p.id} />
                              <input type='hidden' name='year' value={year} />
                              <input type='number' name='days' min='0' max='365' step='0.5' defaultValue={d && d.hasAnnual ? d.annual : ''} placeholder='None' style={{ width: 90 }} />
                              <button className='btn' type='submit'>Save</button>
                            </form>
                          ) : d && d.hasAnnual ? d1(d.annual) : 'None'}
                        </td>
                        <td className='r nw c-meta'>{sofar == null ? 'Not set' : d1(sofar)}{basis(d, monthSum)}</td>
                        <td className='r nw c-meta'>{v ? d1(v) : '0'}{takenSum ? <small className='muted'> ({d1(takenSum)} by month)</small> : null}</td>
                        <td className='r nw'>{left == null ? <span className='muted'>-</span> : <b className={'lvb ' + lvTone(left)}>{left < 0 ? d1(-left) + ' over' : d1(left) + ' left'}</b>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>Total</b></td>
                    <td></td>
                    <td className='r nw'><b>{d1(team.reduce((a, p) => a + ((allow.get(p.id) || {}).sofar || 0), 0))}</b></td>
                    <td className='r nw'><b>{d1(team.reduce((a, p) => a + ((used.get(p.id) || {}).pto || 0), 0))}</b></td>
                    <td className='r nw'><b>{(() => { const t = team.reduce((a, p) => a + (allow.get(p.id) ? allow.get(p.id).sofar - ((used.get(p.id) || {}).pto || 0) : 0), 0); return t < 0 ? d1(-t) + ' over' : d1(t); })()}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <p className='muted'>No {TEAM_SHORT[tm]} team members yet. Add them on the Roster page.</p>}
        </div>
      ) : (
      <div className='card'>
        {team.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead>
                <tr>
                  <th>Team member</th>
                  {TYPES.map(([k, l]) => <th key={k} className='r'>{l}{ALLOWED.includes(k) && set[k] > 0 ? <small> (of {d1(set[k])})</small> : null}</th>)}
                  <th className='r'>Total days</th>
                </tr>
              </thead>
              <tbody>
                {team.map((p) => {
                  const u = used.get(p.id) || {};
                  const total = TYPES.reduce((a, [k]) => a + (u[k] || 0), 0);
                  return (
                    <tr key={p.id}>
                      <td className='c-title'><OfficeTag o={dast ? ((p.sites || []).length > 1 ? p.sites.length + ' sites' : (p.sites || [])[0] ? p.sites[0].site : p.site || '') : p.office} /><b>{p.name}</b></td>
                      {TYPES.map(([k]) => {
                        const v = u[k] || 0;
                        const cap = ALLOWED.includes(k) ? set[k] : 0;
                        if (!(cap > 0)) return <td key={k} className='r nw c-meta'>{v ? d1(v) : '-'}</td>;
                        const left = cap - v;
                        return (
                          <td key={k} className='r nw c-meta'>
                            {d1(v)} used
                            <div><b className={'lvb ' + lvTone(left)}>{d1(left)} left</b></div>
                          </td>
                        );
                      })}
                      <td className='r nw'><b>{total ? d1(total) : '-'}</b></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Yearly total</b></td>
                  {TYPES.map(([k]) => <td key={k} className='r nw'><b>{totals[k] ? d1(totals[k]) : '-'}</b></td>)}
                  <td className='r nw'><b>{d1(Object.values(totals).reduce((a, b) => a + b, 0))}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className='muted'>No {TEAM_SHORT[tm]} team members yet. Add them on the Roster page.</p>}
      </div>
      )}
    </>
  );
}