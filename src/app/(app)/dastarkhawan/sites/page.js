import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES } from '@/lib/att';
import { siteCounts } from '@/lib/roster';
import { addSite, removeSite } from '@/lib/roster-actions';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

// The sites where Dastarkhawan people work. Added and removed here, whenever a site opens or closes.
export default async function SitesPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const edit = can(user, 'dast_edit');
  const sp = await searchParams;
  const sites = await siteCounts();

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dastarkhawan Sites</h1>
          <p className='muted'>The places where the Dastarkhawan team works. Add a site when a new one opens and remove it when it closes. A site can be removed once nobody is at it.</p>
        </div>
      </div>
      <Flash sp={sp} />

      {edit ? (
        <details className='card'>
          <summary>Add a site</summary>
          <form action={addSite} className='form' style={{ gridTemplateColumns: 'minmax(160px, 320px) auto', justifyContent: 'start' }}>
            <label>Site name<input name='name' required maxLength={30} placeholder='For example: OKA' autoComplete='off' /></label>
            <button className='btn primary' type='submit'>Add site</button>
          </form>
        </details>
      ) : null}

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Sites ({sites.length})</h3>
        {sites.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Site</th><th className='r'>People</th>{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {sites.map((st) => (
                  <tr key={st.id}>
                    <td className='c-title'><b>{st.name}</b></td>
                    <td className='r nw c-amt'><b>{st.people}</b> <span className='muted'>{st.people === 1 ? 'person' : 'people'}</span></td>
                    {edit ? (
                      <td className='act'>
                        <form action={removeSite} className='inline'>
                          <input type='hidden' name='id' value={st.id} />
                          <ConfirmButton className='btn ghost' message={'Remove the site ' + st.name + '?'}>Remove</ConfirmButton>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No sites yet. Add the first one above.</p>}
      </div>
    </>
  );
}
