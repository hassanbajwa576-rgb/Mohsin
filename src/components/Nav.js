import Link from 'next/link';
import { logout } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';

export default function Nav({ user }) {
  const links = [['/', 'Dashboard'], ['/expenses', 'Expenses']];
  if (user.role === 'om') links.push(['/funds', 'Funds'], ['/team', 'Team']);
  return (
    <header className='nav'>
      <div className='nav-in'>
        <Link href='/' className='brand'>Petty Cash</Link>
        <nav className='links'>
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <div className='who'>
          <span><b>{user.name}</b><small>{ROLE_LABEL[user.role]} - {user.office_code}</small></span>
          <form action={logout}><button className='btn ghost' type='submit'>Sign out</button></form>
        </div>
      </div>
    </header>
  );
}
