import { redirect } from 'next/navigation';
import { getPending } from '@/lib/auth';
import { verifyLogin } from '@/lib/actions';
import Flash from '@/components/Flash';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({ searchParams }) {
  const sp = await searchParams;
  if (!(await getPending())) redirect('/login');
  return (
    <div className='auth'>
      <form action={verifyLogin} className='card authcard'>
        <div className='logo'>
          <Logo height={40} />
          <h1>Enter your code</h1>
          <p className='muted'>Open your authenticator app and type the 6-digit code for OpsTrack. This device will be remembered for 30 days.</p>
        </div>
        <Flash sp={sp} />
        <label>6-digit code
          <input name='code' inputMode='numeric' autoComplete='one-time-code' autoFocus required />
        </label>
        <label className='perm'>
          <input type='checkbox' name='remember' defaultChecked />
          <span>Remember this device for 30 days</span>
        </label>
        <button className='btn primary' type='submit'>Verify and sign in</button>
        <p className='muted'>Lost your phone? Type one of your recovery codes instead, or ask the Sr. Ops Manager to reset your authenticator.</p>
        <a className='muted' href='/login'>Back to sign in</a>
      </form>
    </div>
  );
}
