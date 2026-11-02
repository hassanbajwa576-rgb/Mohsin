import Link from 'next/link';
import { PERMS, ACTION_PERMS, ROLE_PERMS, BASES } from '@/lib/perms';
import { PAGE_GROUPS, defaultPages } from '@/lib/pages';

// Create or edit a role: a name, which built-in role it works like, then two checklists (what it can do, which pages it can open).
export default function RoleForm({ action, role, label = 'Create role' }) {
  const base = role ? role.base : 'so';
  const perms = role ? String(role.perms || '').split(',').filter(Boolean) : [];
  const picked = role ? String(role.pages || '').split(',').filter(Boolean) : [];
  const effective = picked.length ? picked : defaultPages(base, perms, ROLE_PERMS);
  const sys = !!(role && role.sys_key);
  const inc = ROLE_PERMS[base] || [];
  return (
    <form action={action} className='form'>
      {role ? <input type='hidden' name='id' value={role.id} /> : null}
      {sys ? <p className='muted wide'>This is a built-in role. Its name and what it works like are fixed; you can change what it can do and which pages it can open.</p> : null}
      <label>Role name<input name='name' defaultValue={role ? role.name : ''} maxLength={40} placeholder='For example: Dastarkhawan Incharge' required={!sys} disabled={sys} readOnly={sys} autoComplete='off' /></label>
      <label className='wide'>Works like
        <select name='base' defaultValue={base} disabled={sys}>{BASES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <fieldset className='wide perms'>
        <legend>What this role can do</legend>
        <p className='muted'>Money and approval actions. Only the Sr. Ops Manager can do these unless you tick them here.</p>
        {ACTION_PERMS.map(([key, label2, hint]) => (
          <label key={key} className='perm'>
            <input type='checkbox' name={'perm_' + key} defaultChecked={perms.includes(key)} />
            <span>{label2} <small>- {hint}</small></span>
          </label>
        ))}
      </fieldset>
      <fieldset className='wide perms'>
        <legend>Attendance, visitors and fuel access</legend>
        <p className='muted'>On top of what the role it works like already includes.</p>
        {PERMS.map(([key, label2, hint]) => (
          <label key={key} className='perm'>
            <input type='checkbox' name={'perm_' + key} defaultChecked={inc.includes(key) || perms.includes(key)} disabled={inc.includes(key)} />
            <span>{label2} <small>- {inc.includes(key) ? 'included in this role' : hint}</small></span>
          </label>
        ))}
      </fieldset>
      <fieldset className='wide perms pgs'>
        <legend>Pages this role can open</legend>
        <p className='muted'>Untick a page to hide it for everyone on this role; tick one to add it. A page that needs a permission (for example Reports) switches that permission on when you save. Someone with pages picked on their own profile keeps their own choice.</p>
        <input type='hidden' name='pages_form' value='1' />
        {PAGE_GROUPS.map((g) => (
          <div key={g.key} className='pg-group'>
            <b>{g.label}</b>
            <div className='pg-list'>
              {g.pages.map(([href, label2]) => (
                <label key={href} className='perm'>
                  <input type='checkbox' name='pg' value={href} defaultChecked={effective.includes(href)} />
                  <span>{label2}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <button className='btn primary' type='submit'>{label}</button>
      <Link href='/roles' className='btn ghost'>Cancel</Link>
    </form>
  );
}
