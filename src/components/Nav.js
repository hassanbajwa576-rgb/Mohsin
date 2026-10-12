import Link from 'next/link';
import { logout } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import Logo from './Logo';
import Bell from './Bell';

export default function Nav({ user, unread = 0 }) {
  const links = [['/', 'Dashboard'], ['/expenses', 'Expenses'], ['/advances', 'Advances']];
  if (user.role !== 'so') links.push(['/accounts', 'Accounts']);
  if (user.role === 'om') links.push(['/team', 'Team'], ['/logs', 'Logs']);
  links.push(['/guide', 'Guide']);
  return (
    <header className='nav'>
      <div className='nav-in'>
        <Link href='/' className='brandbox' aria-label='PettyTrack home'>
          <Logo height={30} />
          <span className='sep' />
          <span className='brand-name'>Petty<em>Track</em></span>
        </Link>
        <nav className='links'>
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className='who'>
          <Bell initial={unread} />
          <Link href='/profile' className='me' title='My profile'><b>{user.name}</b><small>{ROLE_LABEL[user.role]} - {user.office_code}</small></Link>
          <form action={logout}><button className='btn ghost' type='submit'>Sign out</button></form>
        </div>
      </div>
    </header>
  );
}
