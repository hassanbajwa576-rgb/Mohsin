import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { editUser, resetTotp } from '@/lib/actions';
import ConfirmButton from '@/components/ConfirmButton';
import { ROLE_LABEL } from '@/lib/fmt';
import { PERMS, ROLE_PERMS } from '@/lib/perms';
import { PAGE_GROUPS, defaultPages } from '@/lib/pages';
import Flash from '@/components/Flash';

export default async function EditUserPage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const id = Number(sp.id);
  const t = (await q(
    `SELECT u.id, u.name, u.email, u.username, u.role, u.phone, u.shift, u.perms, u.pages, u.totp_enabled, u.totp_required, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!t) redirect('/team');
  // Pages picked for this person; none picked means the role's own pages (what is ticked below when nothing was ever saved).
  const picked = String(t.pages || '').split(',').filter(Boolean);
  const effective = picked.length ? picked : defaultPages(t.role, String(t.perms || '').split(',').filter(Boolean), ROLE_PERMS);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit {t.name}</h1>
          <p className='muted'>Changes are recorded in the Logs and the member is notified.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <form action={editUser} className='form'>
          <input type='hidden' name='id' value={t.id} />
          <label>Full name<input name='name' defaultValue={t.name} required /></label>
          <label>Username (login ID)<input name='username' defaultValue={t.username || ''} pattern='[A-Za-z0-9._-]{3,20}' required autoComplete='off' /></label>
          <label>Email<input name='email' type='email' defaultValue={t.email} required /></label>
          {t.role === 'om' ? (
            <label>Role<input value={ROLE_LABEL.om} disabled readOnly /></label>
          ) : (
            <label>Role
              <select name='role' defaultValue={t.role}>
                <option value='sso'>{ROLE_LABEL.sso}</option>
                <option value='so'>{ROLE_LABEL.so}</option>
                <option value='guard'>{ROLE_LABEL.guard} (attendance only)</option>
              </select>
            </label>
          )}
          <label>Office
            <select name='office' defaultValue={t.office}><option>LHR</option><option>ISB</option></select>
          </label>
          <label>Contact number<input name='phone' type='tel' defaultValue={t.phone} placeholder='03xx-xxxxxxx' /></label>
          <label>Guard shift
            <select name='shift' defaultValue={t.shift}><option value=''>Not a guard</option><option value='morning'>Morning</option><option value='evening'>Evening</option></select>
          </label>
          {t.role !== 'om' ? (
            <fieldset className='wide perms'>
              <legend>Attendance access</legend>
              <p className='muted'>Tick what this person may do in AttendTrack, on top of what their role already includes.</p>
              {PERMS.map(([key, label, hint]) => {
                const base = (ROLE_PERMS[t.role] || []).includes(key);
                const on = base || String(t.perms || '').split(',').includes(key);
                return (
                  <label key={key} className='perm'>
                    <input type='checkbox' name={'perm_' + key} defaultChecked={on} disabled={base} />
                    <span>{label} <small>{base ? '- included in this role' : '- ' + hint}</small></span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          {t.role !== 'om' ? (
            <fieldset className='wide perms pgs'>
              <legend>Pages this person can open</legend>
              <p className='muted'>Every module and page of the app. Untick a page to hide it for {t.name}; tick one to add it. A page that needs a permission (for example Reports) switches that permission on when you save. Leave it as it is to keep what the role gives.</p>
              <input type='hidden' name='pages_form' value='1' />
              {PAGE_GROUPS.map((g) => (
                <div key={g.key} className='pg-group'>
                  <b>{g.label}</b>
                  <div className='pg-list'>
                    {g.pages.map(([href, label]) => (
                      <label key={href} className='perm'>
                        <input type='checkbox' name='pg' value={href} defaultChecked={effective.includes(href)} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          ) : null}
          {t.role !== 'om' ? (
            <label className='wide perm'>
              <input type='checkbox' name='require_totp' defaultChecked={t.totp_required} />
              <span>Require the authenticator app <small>- {t.totp_enabled ? 'already set up' : 'they will be asked to set it up at next sign-in'}</small></span>
            </label>
          ) : null}
          <button className='btn primary' type='submit'>Save changes</button>
          <Link href='/team' className='btn ghost'>Cancel</Link>
        </form>
        {t.role !== 'om' && t.totp_enabled ? (
          <form action={resetTotp} className='inline' style={{ marginTop: 16 }}>
            <input type='hidden' name='id' value={t.id} />
            <ConfirmButton className='btn' message='Reset the authenticator app for this person? They will set it up again at their next sign-in.'>Reset authenticator</ConfirmButton>
          </form>
        ) : null}
      </div>
    </>
  );
}
