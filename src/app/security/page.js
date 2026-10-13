import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import QRCode from 'qrcode';
import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { newSecret, otpauthUrl } from '@/lib/totp';
import { confirmSetup, disableTotp, logout } from '@/lib/actions';
import Flash from '@/components/Flash';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';

// Authenticator app: set up, see status, turn off. Lives outside the app layout so a person who
// must set it up can reach it before anything else.
export default async function SecurityPage({ searchParams }) {
  const user = await getUser();
  if (!user) redirect('/login');
  const sp = await searchParams;
  const row = (await q('SELECT totp_secret, totp_enabled, totp_required FROM pc2_users WHERE id = $1', [user.id]))[0];

  let qr = '';
  let secret = '';
  if (!row.totp_enabled) {
    secret = row.totp_secret;
    if (!secret) {
      secret = newSecret();
      await q('UPDATE pc2_users SET totp_secret = $1 WHERE id = $2', [secret, user.id]);
    }
    qr = await QRCode.toDataURL(otpauthUrl(user.email, secret), { margin: 1, width: 220 });
  }
  const jar = await cookies();
  const codes = (jar.get('pc_rc')?.value || '').split(' ').filter(Boolean);
  const mustSetUp = row.totp_required && !row.totp_enabled;

  return (
    <div className='auth'>
      <div className='card authcard secure'>
        <div className='logo'>
          <Logo height={40} />
          <h1>Authenticator app</h1>
          <p className='muted'>{user.name}</p>
        </div>
        <Flash sp={sp} />

        {codes.length > 0 ? (
          <div className='recovery'>
            <b>Save your recovery codes now</b>
            <p className='muted'>Each code works once if you lose your phone. They will not be shown again.</p>
            <ul>{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
          </div>
        ) : null}

        {!row.totp_enabled ? (
          <>
            {mustSetUp ? <p className='must'>The Sr. Ops Manager requires the authenticator app for your account. Set it up to continue.</p> : null}
            <ol className='steps'>
              <li>Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone.</li>
              <li>In the app choose <b>Add account</b> and scan this code.</li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <img src={qr} width={220} height={220} alt='QR code for the authenticator app' className='qr' />
            <p className='muted'>Cannot scan? Enter this key in the app: <code>{secret}</code></p>
            <form action={confirmSetup} className='stack'>
              <label>6-digit code
                <input name='code' inputMode='numeric' autoComplete='one-time-code' required />
              </label>
              <button className='btn primary' type='submit'>Turn on</button>
            </form>
          </>
        ) : (
          <>
            <p className='okline'>The authenticator app is <b>on</b> for your account.</p>
            {!row.totp_required ? (
              <form action={disableTotp} className='stack'>
                <label>To turn it off, type a current code
                  <input name='code' inputMode='numeric' autoComplete='one-time-code' required />
                </label>
                <button className='btn' type='submit'>Turn off</button>
              </form>
            ) : (
              <p className='muted'>It is required by the Sr. Ops Manager, so it cannot be turned off.</p>
            )}
            <a className='btn ghost' href='/'>Back to the app</a>
          </>
        )}

        {mustSetUp ? (
          <form action={logout}><button className='btn ghost' type='submit'>Sign out</button></form>
        ) : null}
      </div>
    </div>
  );
}
