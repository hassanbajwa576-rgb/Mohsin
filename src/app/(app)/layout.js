import Nav from '@/components/Nav';
import TableLabels from '@/components/TableLabels';
import { requireUser } from '@/lib/auth';
import { unreadCount } from '@/lib/queries';
import { getLang } from '@/lib/lang';
import { stopViewAs } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  const unread = 0; // the bell loads the real count in the background
  const lang = await getLang();
  return (
    <>
      {user.impersonatedBy ? (
        <div className='impbar'>
          <span>Viewing as <b>{user.name}</b>. Everything you do is recorded as {user.name} (by {user.impersonatedBy.name}). Ends after 30 minutes.</span>
          <form action={stopViewAs}><button className='btn' type='submit'>Return to my account</button></form>
        </div>
      ) : null}
      <Nav user={user} unread={unread} lang={lang} />
      <TableLabels />
      <main className='wrap'>{children}</main>
      <footer className='foot'><b>OpsTrack</b> by AlphaBOLD | Powered by <b>Ops</b></footer>
    </>
  );
}
