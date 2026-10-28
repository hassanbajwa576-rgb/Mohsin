import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { addUser, resetPassword, toggleUser, viewAs } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import { PERM_SHORT } from '@/lib/perms';
import Flash from '@/components/Flash';

export default async function TeamPage({ searchParams }) {
  const me = await requireUser(['om']);
  const sp = await searchParams;
  const users = await q(
    `SELECT u.id, u.name, u.email, u.username, u.role, u.phone, u.shift, u.perms, u.pages, u.totp_enabled, u.totp_required, u.active, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id ORDER BY CASE u.role WHEN 'om' THEN 0 WHEN 'sso' THEN 1 WHEN 'so' THEN 2 ELSE 3 END, u.name`
  );

  const reqs = await q("SELECT DISTINCT message FROM pc2_notifications WHERE is_read = FALSE AND message LIKE 'Password reset requested by %' AND created_at > now() - interval '7 days'");

  return (
    <>
      <div className='head'>
        <div>
          <h1>Team</h1>
          <p className='muted'>The Sr. Ops Manager leads and gives the final review. The Sr. Support Officer (LHR) manages day-to-day expenses and advances, and the Support Officer (ISB) spends from advances and submits adjustments.</p>
        </div>
        <a href='/team/export' className='btn primary'>Download team list (Excel)</a>
      </div>
      <Flash sp={sp} />
      {reqs.length > 0 ? (
        <div className='card'>
          <b>Password reset requests</b>
          {reqs.map((r) => <div key={r.message} className='muted'>{r.message.replace('Password reset requested by ', '')} - set a new password below with Reset</div>)}
        </div>
      ) : null}

      <details className='card' open>
        <summary>Add team member</summary>
        <form action={addUser} className='form'>
          <label>Full name<input name='name' required /></label>
          <label>Username<input name='username' placeholder='e.g. so2' pattern='[A-Za-z0-9._-]{3,20}' required autoComplete='off' /></label>
          <label>Email<input name='email' type='email' required /></label>
          <label>Role
            <select name='role' defaultValue='so'>
              <option value='sso'>{ROLE_LABEL.sso}</option>
              <option value='so'>{ROLE_LABEL.so}</option>
              <option value='guard'>{ROLE_LABEL.guard} (attendance only)</option>
            </select>
          </label>
          <label>Office
            <select name='office' defaultValue='ISB'><option>LHR</option><option>ISB</option></select>
          </label>
          <label>Contact number<input name='phone' type='tel' placeholder='03xx-xxxxxxx' /></label>
          <label>Guard shift
            <select name='shift' defaultValue=''><option value=''>Not a guard</option><option value='morning'>Morning</option><option value='evening'>Evening</option></select>
          </label>
          <label>Temporary password<input name='password' type='text' minLength={8} required autoComplete='off' /></label>
          <button className='btn primary' type='submit'>Add user</button>
        </form>
      </details>

      <div className='card'>
        <div className='tablewrap'>
          <table>
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Office</th><th>Phone</th><th>Email</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td><code>{u.username || '-'}</code></td>
                  <td>
                    {ROLE_LABEL[u.role]}{u.shift ? ' - ' + (u.shift === 'morning' ? 'Morning' : 'Evening') : ''}
                    {u.pages ? <div className='muted'>Pages picked: {u.pages.split(',').length}</div> : null}
                    {u.perms ? <div className='muted'>+ {u.perms.split(',').map((k) => PERM_SHORT[k] || k).join(', ')}</div> : null}
                    {u.totp_enabled ? <div className='muted'>Authenticator on</div> : u.totp_required ? <div className='muted'>Authenticator required</div> : null}
                  </td>
                  <td><OfficeTag o={u.office} /></td>
                  <td>{u.phone || '-'}</td>
                  <td>{u.email}</td>
                  <td><span className={'badge ' + (u.active ? 'approved' : 'rejected')}>{u.active ? 'Active' : 'Inactive'}</span></td>
                  <td className='act'>
                    <div className='inline'><a href={'/team/edit?id=' + u.id} className='btn'>Edit</a></div>
                    <form action={resetPassword} className='inline'>
                      <input type='hidden' name='id' value={u.id} />
                      <input name='password' placeholder='New password' minLength={8} className='sm' autoComplete='off' required />
                      <button className='btn' type='submit'>Reset</button>
                    </form>
                    {u.id !== me.id && u.active && u.role !== 'om' ? (
                      <form action={viewAs} className='inline'>
                        <input type='hidden' name='id' value={u.id} />
                        <button className='btn' type='submit'>Sign in as</button>
                      </form>
                    ) : null}
                    {u.id !== me.id ? (
                      <form action={toggleUser} className='inline'>
                        <input type='hidden' name='id' value={u.id} />
                        <button className='btn ghost' type='submit'>{u.active ? 'Deactivate' : 'Activate'}</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
