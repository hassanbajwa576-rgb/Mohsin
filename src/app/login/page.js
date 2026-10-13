import { redirect } from 'next/navigation';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { login } from '@/lib/actions';
import Flash from '@/components/Flash';
import Logo from '@/components/Logo';
import LangToggle from '@/components/LangToggle';
import { getLang } from '@/lib/lang';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const lang = await getLang();
  const n = (await q('SELECT count(*)::int AS n FROM pc2_users'))[0].n;
  if (n === 0) redirect('/setup');
  if (await getUser()) redirect('/');
  return (
    <div className='auth'>
      <form action={login} className='card authcard'>
        <div className='lang-row'><LangToggle lang={lang} /></div>
        <div className='logo'>
          <Logo height={40} />
          <h1>OpsTrack</h1>
          <p className='muted'>Operations Platform | Pakistan Office</p>
        </div>
        <Flash sp={sp} />
        <label>Email<input name='email' type='email' required autoComplete='username' /></label>
        <label>Password<input name='password' type='password' required autoComplete='current-password' /></label>
        <button className='btn primary' type='submit'>Sign in</button>
        <a className='muted' href='/login/forgot'>Forgot password?</a>
        <p className='powered'>Powered by <b>Ops</b></p>
      </form>
    </div>
  );
}
