import { redirect } from 'next/navigation';
import { q } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { login } from '@/lib/actions';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const n = (await q('SELECT count(*)::int AS n FROM pc2_users'))[0].n;
  if (n === 0) redirect('/setup');
  if (await getUser()) redirect('/');
  return (
    <div className='auth'>
      <form action={login} className='card authcard'>
        <h1>Petty Cash</h1>
        <p className='muted'>LHR and ISB office expenses</p>
        <Flash sp={sp} />
        <label>Email<input name='email' type='email' required autoComplete='username' /></label>
        <label>Password<input name='password' type='password' required autoComplete='current-password' /></label>
        <button className='btn primary' type='submit'>Sign in</button>
      </form>
    </div>
  );
}
