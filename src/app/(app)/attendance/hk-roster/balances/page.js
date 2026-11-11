import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TYPES, ALLOWED, hkPeople, usedByPerson, getSettings, siteList, dkAllowances } from '@/lib/roster';
import { setDkAllowance, setDkAllowanceAll } from '@/lib/roster-actions';
import { applyHkDates } from '@/lib/hk-dates';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import HkTabs from '@/components/HkTabs';
import { TEAM_SHORT } from '@/lib/teams';
import { can } from '@/lib/perms';

export const dynamic = 'force-dynamic';

const d1 = (v) => String(Math.round(v * 10) / 10);

// Leave balances and the yearly summary: days off per person and per type, against the yearly allowance set in Setup.
// forceTeam: the Dastarkhawan section (/dastarkhawan/balances) shows this same page for its own team.
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
  const allow = dast ? await dkAllowances(year) : new Map();
  const editDk = dast && can(user, 'dast_edit');
  const yq = (y) => base + '?' + new URLSearchParams({ y: String(y), ...(site ? { site } : {}), ...(office && both ? { office } : {}) }).toString();
  const totals = Object.fromEntries(TYPES.map(([k]) => [k, team.reduce((a, p) => a + ((used.get(p.id) || {})[k] || 0), 0)]));
  const anySet = ALLOWED.some((k) => set[k] > 0);

  return (
    <>
      <div className='head'>
        <div>
          <h1>{TEAM_SHORT[tm]} Time-off Balance</h1>
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
        <p className='muted'>For the Dastarkhawan team only PTO applies. Give each person their yearly PTO allowance below; the days used come from the time-off recorded on the roster, and the days left are worked out for you.</p>
      ) : !anySet ? <p className='muted'>No yearly allowance is set yet, so only the days used are shown. Set them on the Setup tab of the Support team.</p> : null}

      {dast && editDk ? (
        <form action={setDkAllowanceAll} className='card filters'>
          <input type='hidden' name='year' value={year} />
          <label>Same PTO for everyone in {year} (days)<input type='number' name='days' min='0' max='365' step='0.5' placeholder='For example: 14' required /></label>
          <button className='btn' type='submit'>Apply to all</button>
          <span className='muted'>You can still change each person below.</span>
        </form>
      ) : null}

      {dast ? (
        <div className='card'>
          {team.length ? (
            <div className='tablewrap'>
              <table className='tx'>
                <thead>
                  <tr><th>Team member</th><th className='r'>PTO allowed ({year})</th><th className='r'>Used</th><th className='r'>Left</th></tr>
                </thead>
                <tbody>
                  {team.map((p) => {
                    const v = (used.get(p.id) || {}).pto || 0;
                    const cap = allow.get(p.id);
                    const left = cap == null ? null : cap - v;
                    const low = cap != null && left < 0.2 * cap;
                    return (
                      <tr key={p.id}>
                        <td className='c-title'><OfficeTag o={(p.sites || []).length > 1 ? p.sites.length + ' sites' : (p.sites || [])[0] ? p.sites[0].site : p.site || ''} /><b>{p.name}</b></td>
                        <td className='r nw c-meta'>
                          {editDk ? (
                            <form action={setDkAllowance} className='inline'>
                              <input type='hidden' name='id' value={p.id} />
                              <input type='hidden' name='year' value={year} />
                              <input type='number' name='days' min='0' max='365' step='0.5' defaultValue={cap == null ? '' : cap} placeholder='Not set' style={{ width: 90 }} />
                              <button className='btn' type='submit'>Save</button>
                            </form>
                          ) : cap == null ? 'Not set' : d1(cap)}
                        </td>
                        <td className='r nw c-meta'>{v ? d1(v) : '0'}</td>
                        <td className='r nw'>{left == null ? <span className='muted'>-</span> : <b style={{ color: low ? '#b3261e' : '#1b6e34', background: low ? '#fbd3d3' : '#d9f1df', padding: '0 6px', borderRadius: 3 }}>{d1(left)} left</b>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>Total</b></td>
                    <td className='r nw'><b>{d1(team.reduce((a, p) => a + (allow.get(p.id) || 0), 0))}</b></td>
                    <td className='r nw'><b>{d1(team.reduce((a, p) => a + ((used.get(p.id) || {}).pto || 0), 0))}</b></td>
                    <td className='r nw'><b>{d1(team.reduce((a, p) => a + (allow.get(p.id) == null ? 0 : allow.get(p.id) - ((used.get(p.id) || {}).pto || 0)), 0))}</b></td>
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
                        const low = left < 0.2 * cap;
                        return (
                          <td key={k} className='r nw c-meta'>
                            {d1(v)} used
                            <div><b style={{ color: low ? '#b3261e' : '#1b6e34', background: low ? '#fbd3d3' : '#d9f1df', padding: '0 6px', borderRadius: 3 }}>{d1(left)} left</b></div>
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