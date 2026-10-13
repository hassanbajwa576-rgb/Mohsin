import { requestReset } from '@/lib/actions';
import Flash from '@/components/Flash';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';

export default async function ForgotPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <div className='auth'>
      <form action={requestReset} className='card authcard'>
        <div className='logo'>
          <Logo height={40} />
          <h1>Forgot password</h1>
          <p className='muted'>Enter your email. The Sr. Ops Manager is notified and will give you a new password.</p>
        </div>
        <Flash sp={sp} />
        <label>Email<input name='email' type='email' required autoComplete='username' /></label>
        <button className='btn primary' type='submit'>Send request</button>
        <a className='muted' href='/login'>Back to sign in</a>
      </form>
    </div>
  );
}
