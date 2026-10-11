import Nav from '@/components/Nav';
import { requireUser } from '@/lib/auth';
import { unreadCount } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await requireUser();
  const unread = await unreadCount(user.id);
  return (
    <>
      <Nav user={user} unread={unread} />
      <main className='wrap'>{children}</main>
      <footer className='foot'><b>PettyTrack</b> by AlphaBOLD | Powered by <b>Operations</b></footer>
    </>
  );
}
