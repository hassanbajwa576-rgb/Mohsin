import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { createRole, toggleRole } from '@/lib/role-actions';
import { BASES, PERM_SHORT } from '@/lib/perms';
import RoleForm from '@/components/RoleForm';
import Flash from '@/components/Flash';

export default async function RolesPage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const roles = await q(
    `SELECT r.id, r.name, r.base, r.perms, r.pages, r.active, r.sys_key, (SELECT COUNT(*)::int FROM pc2_users u WHERE u.role_id = r.id AND u.active) AS members FROM pc2_roles r ORDER BY (r.sys_key IS NULL), CASE r.sys_key WHEN 'om' THEN 0 WHEN 'sso' THEN 1 WHEN 'so' THEN 2 ELSE 3 END, r.active DESC, r.name`
  );
  const baseName = Object.fromEntries(BASES.map(([k, v]) => [k, v.split(' - ')[0]]));

  return (
    <>
      <div className='head'>
        <div>
          <h1>Roles</h1>
          <p className='muted'>Create a role, tick what it can do and which pages it can open, then assign it to people from the Team page. The four built-in roles start with exactly what each can do today; the Sr. Ops Manager role is fixed and always has full access.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <details className='card'>
        <summary>Create a role</summary>
        <RoleForm action={createRole} />
      </details>

      <div className='card'>
        {roles.length ? (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>Role</th><th>Works like</th><th>Extra access</th><th>People</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.name}</b>{r.sys_key ? <div className='muted'>Built-in</div> : null}</td>
                    <td>{baseName[r.base]}</td>
                    <td className='muted'>{r.sys_key === 'om' ? 'Everything' : String(r.perms || '').split(',').filter(Boolean).map((k) => PERM_SHORT[k] || k).join(', ') || '-'}{r.pages ? ' - ' + r.pages.split(',').length + ' pages picked' : ''}</td>
                    <td>{r.members}</td>
                    <td><span className={'badge ' + (r.active ? 'approved' : 'rejected')}>{r.active ? 'Active' : 'Inactive'}</span></td>
                    <td className='act'>
                      {r.sys_key === 'om' ? <span className='muted'>Fixed - full access</span> : <div className='inline'><a href={'/roles/edit?id=' + r.id} className='btn'>Edit</a></div>}
                      {r.sys_key ? null : (
                        <form action={toggleRole} className='inline'>
                          <input type='hidden' name='id' value={r.id} />
                          <button className='btn ghost' type='submit'>{r.active ? 'Deactivate' : 'Reactivate'}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No roles yet.</p>}
      </div>
    </>
  );
}
