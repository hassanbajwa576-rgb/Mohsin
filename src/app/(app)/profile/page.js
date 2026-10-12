import { requireUser } from '@/lib/auth';
import { updateProfile, changePassword } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import Flash from '@/components/Flash';

export default async function ProfilePage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const locked = user.role === 'sso';
  return (
    <>
      <div className='head'>
        <div>
          <h1>My profile</h1>
          <p className='muted'>{ROLE_LABEL[user.role]} - {user.office_code} office</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='card'>
        <h3>Your details</h3>
        <form action={updateProfile} className='form'>
          <label>Full name<input name='name' defaultValue={user.name} required readOnly={locked} /></label>
          <label>Email (your login ID)<input name='email' type='email' defaultValue={user.email} required readOnly={locked} /></label>
          <label>Role<input value={ROLE_LABEL[user.role]} disabled readOnly /></label>
          <label>Office<input value={user.office_code} disabled readOnly /></label>
          {locked ? null : <button className='btn primary' type='submit'>Save details</button>}
        </form>
        <p className='muted'>{locked ? 'Your name, email, role and office are managed by the Operations Manager.' : 'Role and office are managed by the Operations Manager.'}</p>
      </div>

      <div className='card'>
        <h3>Change password</h3>
        <form action={changePassword} className='form'>
          <label>Current password<input name='current' type='password' autoComplete='current-password' required /></label>
          <label>New password (min 8 characters)<input name='next' type='password' minLength={8} autoComplete='new-password' required /></label>
          <label>Repeat new password<input name='again' type='password' minLength={8} autoComplete='new-password' required /></label>
          <button className='btn primary' type='submit'>Change password</button>
        </form>
      </div>
    </>
  );
}
