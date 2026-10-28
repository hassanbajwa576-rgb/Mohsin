import Link from 'next/link';
import { logout } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import Logo from './Logo';
import Bell from './Bell';
import LangToggle from './LangToggle';
import ModuleTier from './ModuleTier';
import TopLinks from './TopLinks';
import MobileMenu from './MobileMenu';
import { PERMS, can } from '@/lib/perms';

// Two-tier header. Row 1: AlphaBOLD logo, OpsTrack, account. Row 2: module switch and menu.
export default function Nav({ user, unread = 0, lang = 'en', reviews = 0, approvals = 0, allowed = null }) {
  const guard = user.role === 'guard';
  const access = PERMS.map(([k]) => k).filter((k) => can(user, k));
  const who = (
    <>
      <b>{user.name}</b>
      <small>{ROLE_LABEL[user.role]} - {user.role === 'om' ? 'PK' : user.office_code}</small>
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
        {guard ? null : <TopLinks role={user.role} approvals={approvals} allowed={allowed} />}
        <div className='who'>
          <LangToggle lang={lang} />
          {guard ? null : <Bell initial={unread} />}
          {guard
            ? <span className='me'>{who}</span>
            : <Link href='/profile' className='me' title='My profile'>{who}</Link>}
          {guard ? null : <MobileMenu role={user.role} approvals={approvals} allowed={allowed} />}
          <form action={logout}><button className='btn ghost' type='submit'>Sign out</button></form>
        </div>
      </div>
      {guard ? null : (
        <nav className='toplinks-m' aria-label='Manager links'>
            {user.role === 'om' ? <Link href='/approvals'>Approvals{approvals ? <span className='navbadge'>{approvals}</span> : null}</Link> : null}
            {user.role === 'om' ? <Link href='/team'>Team</Link> : null}
            {user.role === 'om' ? <Link href='/logs'>Audit Log</Link> : null}
            <Link href='/guide'>Guide</Link>
        </nav>
      )}
      <ModuleTier role={user.role} access={access} reviews={reviews} approvals={approvals} allowed={allowed} />
    </header>
  );
}
