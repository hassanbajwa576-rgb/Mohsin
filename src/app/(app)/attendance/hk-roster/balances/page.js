import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { TYPES, ALLOWED, hkPeople, usedByPerson, getSettings } from '@/lib/roster';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import HkTabs from '@/components/HkTabs';

export const dynamic = 'force-dynamic';

const d1 = (v) => String(Math.round(v * 10) / 10);

// Leave balances and the yearly summary: days off per person and per type, against the yearly allowance set in Setup.
export default async function BalancesPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (user.role !== 'om' && user.role !== 'sso') redirect('/attendance/hk-roster/request');
  const sp = await searchParams;
  const thisYear = Number(todayKey().slice(0, 4));
  const year = /^\d{4}$/.test(sp.y || '') ? Number(sp.y) : thisYear;
  const both = allOffices(user);
  const office = both ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const team = await hkPeople({ office });
  const used = await usedByPerson(year, office);
  const set = await getSettings();
  const yq = (y) => '/attendance/hk-roster/balances?' + new URLSearchParams({ y: String(y), ...(office && both ? { office } : {}) }).toString();
  const totals = Object.fromEntries(TYPES.map(([k]) => [k, team.reduce((a, p) => a + ((used.get(p.id) || {})[k] || 0), 0)]));
  const anySet = ALLOWED.some((k) => set[k] > 0);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Support Time-off Balance</h1>
          <p className='muted'>Days off used in {year} against the yearly allowance. Hours count as part of a day ({set.hpd} hours = 1 day) and holidays are not counted. Allowances do not carry forward.</p>
        </div>
      </div>
      <HkTabs active='balances' />
      <Flash sp={sp} />
      <div className='card rosnav'>
        <Link className='btn' href={yq(year - 1)}>&lt; {year - 1}</Link>
        <b>{year}</b>
        <Link className='btn' href={yq(year + 1)}>{year + 1} &gt;</Link>
        {year !== thisYear ? <Link className='btn ghost' href={yq(thisYear)}>This year</Link> : null}
      </div>
      {both ? <AutoFilters hidden={{ y: String(year) }} fields={[{ name: 'office', label: 'Office', value: office, options: [['', 'Both offices'], ['LHR', 'LHR'], ['ISB', 'ISB']] }]} /> : null}
      {!anySet ? <p className='muted'>No yearly allowance is set yet, so only the days used are shown. Set them on the Setup tab.</p> : null}

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
                      <td className='c-title'><OfficeTag o={p.office} /><b>{p.name}</b></td>
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
        ) : <p className='muted'>No Support team members yet. Add them on the Roster tab.</p>}
      </div>
    </>
  );
}