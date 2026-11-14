import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES } from '@/lib/att';
import { siteAll } from '@/lib/roster';
import { sortSites } from '@/lib/dk-sites';
import { addSite, removeSite, renameSite, reactivateSite, deleteSite } from '@/lib/roster-actions';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

// Manage > Sites: the places where Dastarkhawan people work. Add, rename, deactivate (and reactivate) or delete a site.
export default async function SitesPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const edit = can(user, 'dast_edit');
  const sp = await searchParams;
  const all = await siteAll();
  const order = sortSites(all.map((x) => x.name));
  const byOrder = (a, b) => order.indexOf(a.name) - order.indexOf(b.name);
  const active = all.filter((x) => x.active).sort(byOrder);
  const inactive = all.filter((x) => !x.active).sort(byOrder);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Dastarkhawan Sites</h1>
          <p className='muted'>The places where the Dastarkhawan team works. Add a site when a new one opens, rename it, or deactivate it when it closes (it can be brought back later). A site that was never used can also be deleted.</p>
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
        <h3 style={{ marginTop: 0 }}>Active sites ({active.length})</h3>
        {active.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Site</th><th className='r'>People</th>{edit ? <th>Rename</th> : null}{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {active.map((st) => (
                  <tr key={st.id}>
                    <td className='c-title'><b>{st.name}</b></td>
                    <td className='r nw c-amt'><b>{st.people}</b> <span className='muted'>{st.people === 1 ? 'person' : 'people'}</span></td>
                    {edit ? (
                      <td className='c-meta'>
                        <form action={renameSite} className='inline'>
                          <input type='hidden' name='id' value={st.id} />
                          <input name='name' defaultValue={st.name} maxLength={30} required autoComplete='off' aria-label={'New name for ' + st.name} style={{ width: 130 }} />
                          <button className='btn' type='submit'>Save</button>
                        </form>
                      </td>
                    ) : null}
                    {edit ? (
                      <td className='act'>
                        <form action={removeSite} className='inline'>
                          <input type='hidden' name='id' value={st.id} />
                          <ConfirmButton className='btn ghost' message={'Deactivate the site ' + st.name + '? It stays in the records and can be reactivated.'}>Deactivate</ConfirmButton>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No active sites. Add one above or reactivate one below.</p>}
      </div>

      {inactive.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Inactive sites ({inactive.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Site</th>{edit ? <th></th> : null}</tr></thead>
              <tbody>
                {inactive.map((st) => (
                  <tr key={st.id}>
                    <td className='c-title'><b>{st.name}</b> <span className='muted'>{st.refs ? 'used in past records' : 'never used'}</span></td>
                    {edit ? (
                      <td className='act'>
                        <form action={reactivateSite} className='inline'>
                          <input type='hidden' name='id' value={st.id} />
                          <button className='btn' type='submit'>Reactivate</button>
                        </form>
                        {!st.refs ? (
                          <form action={deleteSite} className='inline' style={{ marginLeft: 8 }}>
                            <input type='hidden' name='id' value={st.id} />
                            <ConfirmButton className='btn ghost' message={'Delete the site ' + st.name + ' for good?'}>Delete</ConfirmButton>
                          </form>
                        ) : null}
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
