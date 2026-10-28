import Nav from '@/components/Nav';
import TableLabels from '@/components/TableLabels';
import { requireUser } from '@/lib/auth';
import { unreadCount } from '@/lib/queries';
import { q } from '@/lib/db';
import { can } from '@/lib/perms';
import { getLang } from '@/lib/lang';
import { stopViewAs } from '@/lib/actions';
import PushPrompt from '@/components/PushPrompt';
import TextHelp from '@/components/TextHelp';
import MotionKit from '@/components/MotionKit';
import TitleGold from '@/components/TitleGold';
import Welcome from '@/components/Welcome';
import { NumpadProvider } from '@/components/TimePick';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  const unread = 0; // the bell loads the real count in the background
  const lang = await getLang();
  // Days from an Excel import that still need a decision (Sr. Ops Manager only).
  let reviews = 0;
  let approvals = 0;
  if (can(user, 'att_import')) {
    try {
      reviews = (await q('SELECT COUNT(*)::int AS n FROM pc2_import_review WHERE resolved_at IS NULL AND kind = \'conflict\''))[0].n;
    } catch {
      reviews = 0;
    }
  }
  if (user.role === 'om') {
    try {
      approvals = (await q("SELECT (SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int FROM pc2_expenses WHERE status IN ('submitted', 'verified')) + (SELECT COUNT(*)::int FROM pc2_visitors WHERE del_req_by IS NOT NULL) + (SELECT COUNT(*)::int FROM pc2_hk_off WHERE status = 'pending') + (SELECT COUNT(*)::int FROM pc2_fuel_refill WHERE status = 'open') AS n"))[0].n;
    } catch {
      approvals = 0;
    }
  }
  const ROLE = { om: 'Sr. Ops Manager', sso: 'Sr. Support Officer', so: 'Support Officer', guard: 'Guard' };
  const roleLine = (ROLE[user.role] || '') + (user.office_code ? ' | ' + user.office_code : '');
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('ot-welcome'))document.documentElement.classList.add('ot-seen')}catch(e){}" }} />
      {user.impersonatedBy ? (
        <div className='impbar'>
          <span>Viewing as <b>{user.name}</b>. Everything you do is recorded as {user.name} (by {user.impersonatedBy.name}). Ends after 30 minutes.</span>
          <form action={stopViewAs}><button className='btn' type='submit'>Return to my account</button></form>
        </div>
      ) : null}
      <Nav user={user} unread={unread} lang={lang} reviews={reviews} approvals={approvals} />
      <TableLabels />
      <PushPrompt />
      <TextHelp />
      <MotionKit />
      <TitleGold />
      <NumpadProvider on><main className='wrap'>{children}</main></NumpadProvider>
      <Welcome name={user.name} role={roleLine} />
      <footer className='foot'><b>OpsTrack</b> by AlphaBOLD | Powered by <b>Ops</b></footer>
    </>
  );
}
