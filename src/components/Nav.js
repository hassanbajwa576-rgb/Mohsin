import Link from 'next/link';
import { logout } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import Logo from './Logo';
import Bell from './Bell';
import LangToggle from './LangToggle';
import ModuleBadge from './ModuleBadge';

export default function Nav({ user, unread = 0, lang = 'en' }) {
  const guard = user.role === 'guard';
  // Guards only use AttendTrack (attendance); everyone else gets it alongside PettyTrack.
  const links = guard ? [['/attendance', 'Attendance']] : [['/', 'Dashboard'], ['/expenses', 'Expenses'], ['/advances', 'Advances']];
  if (!guard) {
    if (user.role !== 'so') links.push(['/accounts', 'Accounts']);
    links.push(['/attendance', 'Attendance']);
    if (user.role === 'om') links.push(['/team', 'Team'], ['/logs', 'Logs']);
    links.push(['/guide', 'Guide']);
  }
  return (
    <header className='nav'>
      <div className='nav-in'>
        <Link href='/' className='brandbox' aria-label='OpsTrack home'>
          <Logo height={30} />
          <span className='sep' />
          <span className='brand-name'>Ops<em>Track</em></span>
          <ModuleBadge />
        </Link>
        <nav className='links'>
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className='who'>
          <LangToggle lang={lang} />
          {guard ? null : <Bell initial={unread} />}
          {guard
            ? <span className='me'><b>{user.name}</b><small>{ROLE_LABEL[user.role]} - {user.office_code}</small></span>
            : <Link href='/profile' className='me' title='My profile'><b>{user.name}</b><small>{ROLE_LABEL[user.role]} - {user.office_code}</small></Link>}
          <form action={logout}><button className='btn ghost' type='submit'>Sign out</button></form>
        </div>
      </div>
    </header>
  );
}
