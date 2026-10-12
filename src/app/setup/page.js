import { redirect } from 'next/navigation';
import { q } from '@/lib/db';
import { setup } from '@/lib/actions';
import Flash from '@/components/Flash';
import Logo from '@/components/Logo';
import LangToggle from '@/components/LangToggle';
import { getLang } from '@/lib/lang';

export const dynamic = 'force-dynamic';

export default async function SetupPage({ searchParams }) {
  const sp = await searchParams;
  const lang = await getLang();
  const n = (await q('SELECT count(*)::int AS n FROM pc2_users'))[0].n;
  if (n > 0) redirect('/login');
  return (
    <div className='auth'>
      <form action={setup} className='card authcard'>
        <div className='lang-row'><LangToggle lang={lang} /></div>
        <div className='logo'>
          <Logo height={40} />
          <h1>PettyTrack setup</h1>
          <p className='muted'>Create the Senior Operations Manager account (LHR). You can add the SSO and SO users afterwards from the Team page.</p>
        </div>
        <Flash sp={sp} />
        <label>Full name<input name='name' required /></label>
        <label>Email<input name='email' type='email' required autoComplete='username' /></label>
        <label>Password (min 8 characters)<input name='password' type='password' minLength={8} required autoComplete='new-password' /></label>
        <button className='btn primary' type='submit'>Create account</button>
        <p className='powered'>Powered by <b>Operations</b></p>
      </form>
    </div>
  );
}
