import Link from 'next/link';
import { logout } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import Logo from './Logo';
import Bell from './Bell';
import LangToggle from './LangToggle';
import ModuleTier from './ModuleTier';

// Two-tier header. Row 1: AlphaBOLD logo, OpsTrack, account. Row 2: module switch and menu.
export default function Nav({ user, unread = 0, lang = 'en' }) {
  const guard = user.role === 'guard';
  const who = (
    <>
      <b>{user.name}</b>
      <small>{ROLE_LABEL[user.role]} - {user.office_code}</small>
    </>
  );
  return (
    <header className='nav'>
      <div className='nav-top'>
        <Link href={guard ? '/attendance' : '/'} className='brandbox' aria-label='OpsTrack home'>
          <Logo height={44} />
          <span className='sep' />
          <span className='brand-name' translate='no'>Ops<em>Track</em></span>
        </Link>
        <div className='who'>
          <LangToggle lang={lang} />
          {guard ? null : <Bell initial={unread} />}
          {guard
            ? <span className='me'>{who}</span>
            : <Link href='/profile' className='me' title='My profile'>{who}</Link>}
          <form action={logout}><button className='btn ghost' type='submit'>Sign out</button></form>
        </div>
      </div>
      <ModuleTier role={user.role} />
    </header>
  );
}
