import Nav from '@/components/Nav';
import TableLabels from '@/components/TableLabels';
import { requireUser } from '@/lib/auth';
import { unreadCount } from '@/lib/queries';
import { getLang } from '@/lib/lang';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  const unread = 0; // the bell loads the real count in the background
  const lang = await getLang();
  return (
    <>
      <Nav user={user} unread={unread} lang={lang} />
      <TableLabels />
      <main className='wrap'>{children}</main>
      <footer className='foot'><b>PettyTrack</b> by AlphaBOLD | Powered by <b>Ops</b></footer>
    </>
  );
}
