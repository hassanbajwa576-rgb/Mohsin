import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { hkPeople, hkInactive, dkLinked, dkAllowances } from '@/lib/roster';
import { sortSites } from '@/lib/dk-sites';
import { siteText } from '@/lib/teams';

export const dynamic = 'force-dynamic';

const clean = (v) => String(v || '').replace(/^BOLDDastarkhawan\s*/i, '');

// Manage > Team: the details of every Dastarkhawan team member (sites, joining date, facial app link, leave allowance) and who is inactive.
export default async function DastarkhawanTeam() {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const year = Number(todayKey().slice(0, 4));
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
          <p className='muted'>Everyone in the Dastarkhawan team with their sites, joining date, facial attendance app link and {year} leave allowance. To add, edit or deactivate a member, use the <Link href='/dastarkhawan'>Roster</Link> page.</p>
        </div>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Active members ({team.length})</h3>
        {team.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Sites</th><th>Joined</th><th>Phone</th><th>Facial app</th><th className='r'>Leaves {year}</th></tr></thead>
              <tbody>
                {team.map((p) => {
                  const l = link.get(p.id);
                  const a = allow.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td className='c-title'><b>{p.name}</b>{p.dept ? <small className='muted'> {p.dept}</small> : null}</td>
                      <td className='c-meta'><small className='dklbl'>Sites </small>{sitesOf(p) || '-'}</td>
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
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Sites</th><th>Since</th><th>Reason</th></tr></thead>
              <tbody>
                {inactive.map((p) => (
                  <tr key={p.id}>
                    <td className='c-title'><b>{p.name}</b></td>
                    <td className='c-meta'><small className='dklbl'>Sites </small>{sitesOf(p) || '-'}</td>
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
