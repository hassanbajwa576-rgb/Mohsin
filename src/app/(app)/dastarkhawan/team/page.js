import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { hkPeople, hkInactive, dkLinked, dkAllowances, siteList } from '@/lib/roster';
import { addHkPerson } from '@/lib/roster-actions';
import { sortSites } from '@/lib/dk-sites';
import { siteText } from '@/lib/teams';
import NavOffset from '@/components/NavOffset';
import OfficeTag from '@/components/OfficeTag';
import SiteMap from '@/components/SiteMap';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const clean = (v) => String(v || '').replace(/^BOLDDastarkhawan\s*/i, '');

// Manage > Team: the details of every Dastarkhawan team member (sites, joining date, facial app link, leave allowance) and who is inactive.
export default async function DastarkhawanTeam({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const sp = await searchParams;
  const year = Number(todayKey().slice(0, 4));
  const sites = sortSites(await siteList());
  const [team, inactive, linked, allow] = await Promise.all([hkPeople({ team: 'dast' }), hkInactive('dast'), dkLinked(), dkAllowances(year)]);
  const link = new Map(linked.map((l) => [l.id, l]));
  const sitesOf = (p) => {
    const codes = sortSites((p.sites || []).map((x) => x.site));
    return siteText(codes.map((c) => (p.sites || []).find((x) => x.site === c)));
  };

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dastarkhawan Team</h1>
          <p className='muted'>Everyone in the Dastarkhawan team with their sites, joining date, facial attendance app link and {year} leave allowance. To edit or deactivate a member, use the <Link href='/dastarkhawan'>Roster</Link> page.</p>
        </div>
      </div>

      <Flash sp={sp} />
      <details className='card' open={!!(sp && (sp.err || sp.ok))}>
        <summary>Add team member</summary>
        <form action={addHkPerson} className='form'>
          <input type='hidden' name='team' value='dast' />
          <label>Name<input name='name' required maxLength={80} placeholder='Team member name' autoComplete='off' /></label>
          <label>Role (optional)<input name='role' maxLength={60} placeholder='For example: cook, helper' /></label>
          <label>Phone<input name='phone' type='tel' maxLength={30} placeholder='03xx xxxxxxx' /></label>
          <label>Joining date<input type='date' name='joined' /></label>
          <label>Birthday<input type='date' name='birthday' /></label>
          <SiteMap sites={sites} />
          <button className='btn primary' type='submit'>Add team member</button>
        </form>
      </details>

      <NavOffset />
      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Active members ({team.length})</h3>
        {team.length ? (
          <div className='tablewrap dk-sticky'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Sites</th><th>Joined</th><th>Phone</th><th>Facial app</th><th className='r'>Leaves {year}</th></tr></thead>
              <tbody>
                {team.map((p) => {
                  const l = link.get(p.id);
                  const a = allow.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td className='c-title'><b>{p.name}</b>{p.dept ? <small className='muted'> {p.dept}</small> : null}</td>
                      <td className='c-meta'><small className='dklbl'>Sites </small>{(p.sites || []).length ? sortSites((p.sites || []).map((x) => x.site)).map((c) => { const x = (p.sites || []).find((y) => y.site === c); return <span key={c} title={x && x.days ? siteText([x]) : undefined}><OfficeTag o={c} />{x && x.days ? <small className='muted'>{siteText([x]).replace(c, '').trim()} </small> : null}</span>; }) : '-'}</td>
                      <td className='c-meta nw'><small className='dklbl'>Joined </small>{p.joined_on || '-'}</td>
                      <td className='c-meta nw'><small className='dklbl'>Phone </small>{p.phone || '-'}</td>
                      <td className='c-meta'>
                        <small className='dklbl'>Facial app </small>
                        {l ? <span>{l.fname ? clean(l.fname) : l.emp_id} <span className='muted'>({l.emp_id})</span></span> : <span className='dka-pill warn'>Not linked</span>}
                      </td>
                      <td className='r nw c-amt'>{a != null ? <b>{a}</b> : <span className='muted'>-</span>} {a != null ? <span className='muted'>days</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No active members yet.</p>}
      </div>

      {inactive.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Inactive members ({inactive.length})</h3>
          <div className='tablewrap dk-sticky'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Sites</th><th>Since</th><th>Reason</th></tr></thead>
              <tbody>
                {inactive.map((p) => (
                  <tr key={p.id}>
                    <td className='c-title'><b>{p.name}</b></td>
                    <td className='c-meta'><small className='dklbl'>Sites </small>{(p.sites || []).length ? sortSites((p.sites || []).map((x) => x.site)).map((c) => { const x = (p.sites || []).find((y) => y.site === c); return <span key={c} title={x && x.days ? siteText([x]) : undefined}><OfficeTag o={c} />{x && x.days ? <small className='muted'>{siteText([x]).replace(c, '').trim()} </small> : null}</span>; }) : '-'}</td>
                    <td className='c-meta nw'><small className='dklbl'>Since </small>{p.eff || '-'}</td>
                    <td className='c-meta'><small className='dklbl'>Reason </small>{p.reason || '-'}{p.remarks ? <small className='muted'> {p.remarks}</small> : null}{p.active_from ? <small className='muted'> (back on {p.active_from})</small> : null}</td>
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
