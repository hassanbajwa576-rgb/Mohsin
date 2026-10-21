import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, allOffices, todayKey } from '@/lib/att';
import { OPD_LIMIT, opdSummary, opdClaims } from '@/lib/hk-opd';
import { addOpdClaim, deleteOpdClaim } from '@/lib/roster-actions';
import Flash from '@/components/Flash';
import HkTabs from '@/components/HkTabs';
import OfficeTag from '@/components/OfficeTag';
import AutoFilters from '@/components/AutoFilters';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const pkr = (n) => 'PKR ' + Math.round(Number(n) || 0).toLocaleString('en-US');

// OPD for the Support team: the yearly limit is the same for everyone (1 January to 31 December, no carry forward).
export default async function HkOpdPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (user.role !== 'om' && user.role !== 'sso') redirect('/attendance');
  const sp = await searchParams;
  const thisYear = Number(todayKey().slice(0, 4));
  const year = /^\d{4}$/.test(sp.y || '') ? Number(sp.y) : thisYear;
  const edit = can(user, 'roster_edit');
  const both = allOffices(user);
  const office = both ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const people = await opdSummary(year, office);
  const claims = await opdClaims(year, office);
  const totalAvailed = people.reduce((a, p) => a + Number(p.availed), 0);
  const yq = (y) => '/attendance/hk-roster/opd?' + new URLSearchParams({ y: String(y), ...(office && both ? { office } : {}) }).toString();
  const low = (p) => p.available < 0.2 * OPD_LIMIT;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Support OPD</h1>
          <p className='muted'>Every team member has {pkr(OPD_LIMIT)} of OPD a year, from 1 January to 31 December. Unused amounts do not carry forward.</p>
        </div>
        <div className='inline'>
          <a href={'/attendance/hk-roster/opd/xlsx?' + new URLSearchParams({ y: String(year), ...(office && both ? { office } : {}) }).toString()} className='btn primary'>Download Excel (.xlsx)</a>
        </div>
      </div>
      <HkTabs active='opd' />
      <Flash sp={sp} />

      <div className='card rosnav'>
        <Link className='btn' href={yq(year - 1)}>&lt; {year - 1}</Link>
        <b>{year}</b>
        <Link className='btn' href={yq(year + 1)}>{year + 1} &gt;</Link>
        {year !== thisYear ? <Link className='btn ghost' href={yq(thisYear)}>This year</Link> : null}
      </div>
      {both ? <AutoFilters hidden={{ y: String(year) }} fields={[{ name: 'office', label: 'Office', value: office, options: [['', 'Both offices'], ['LHR', 'LHR'], ['ISB', 'ISB']] }]} /> : null}

      <div className='kpis'>
        <div className='card kpi'><span>Team members</span><b>{people.length}</b></div>
        <div className='card kpi alt'><span>Availed in {year}</span><b>{pkr(totalAvailed)}</b></div>
        <div className='card kpi alt'><span>Available in {year}</span><b>{pkr(people.length * OPD_LIMIT - totalAvailed)}</b></div>
      </div>

      {edit ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Record an OPD claim</h3>
          <form action={addOpdClaim} className='form'>
            <input type='hidden' name='year' value={year} />
            <label>Team member
              <select name='hk_id' required defaultValue=''>
                <option value='' disabled>Choose</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({pkr(p.available)} available)</option>)}
              </select>
            </label>
            <label>Date<input type='date' name='date' defaultValue={year === thisYear ? todayKey() : year + '-01-01'} required /></label>
            <label>Amount (PKR)<input type='number' name='amount' min='1' step='0.01' inputMode='decimal' required /></label>
            <label className='wide'>Note (optional)<input name='note' maxLength={120} placeholder='For example: clinic visit' /></label>
            <button className='btn primary' type='submit'>Add claim</button>
          </form>
        </div>
      ) : null}

      <div className='card'>
        {people.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th className='r'>Annual limit</th><th className='r'>Availed</th><th className='r'>Available</th><th>Used</th></tr></thead>
              <tbody>
                {people.map((p) => {
                  const pct = Math.min(100, Math.round((Number(p.availed) / OPD_LIMIT) * 100));
                  const box = low(p) ? { color: '#b3261e', background: '#fbd3d3' } : { color: '#1b6e34', background: '#d9f1df' };
                  return (
                    <tr key={p.id}>
                      <td className='c-title'><OfficeTag o={p.office} /><b>{p.name}</b>{p.role ? <div className='muted'>{p.role}</div> : null}</td>
                      <td className='r nw c-meta'>{pkr(OPD_LIMIT)}</td>
                      <td className='r nw c-meta'>{pkr(p.availed)}{p.n ? <div className='muted'>{p.n} claim{p.n > 1 ? 's' : ''}</div> : null}</td>
                      <td className='r nw'><b style={{ ...box, padding: '1px 7px', borderRadius: 3, display: 'inline-block' }}>{pkr(p.available)}</b></td>
                      <td className='c-meta' style={{ minWidth: 120 }}>
                        <div className='opdbar'><span style={{ width: pct + '%' }} /></div>
                        <small className='muted'>{pct}% used</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No Support team members yet. Add them on the Support Roster page.</p>}
      </div>

      {claims.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Claims in {year} ({claims.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Date</th><th>Team member</th><th className='r'>Amount</th><th>Note</th><th>Added by</th>{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td className='nw c-meta'>{c.claim_date}</td>
                    <td className='c-title'><OfficeTag o={c.office} /><b>{c.name}</b></td>
                    <td className='r nw c-meta'>{pkr(c.amount)}</td>
                    <td className='c-meta'>{c.note || ''}</td>
                    <td className='c-meta'>{c.by_name || '-'}</td>
                    {edit ? (
                      <td className='act'>
                        <form action={deleteOpdClaim} className='inline'>
                          <input type='hidden' name='id' value={c.id} />
                          <input type='hidden' name='year' value={year} />
                          <ConfirmButton className='btn ghost' message='Remove this claim?'>Remove</ConfirmButton>
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