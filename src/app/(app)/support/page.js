import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { SUPPORT_ROLES } from '@/lib/att';
import { complaintRows, stats, remindOverdue, isMgr, refOf } from '@/lib/support';
import ComplaintTable from '@/components/ComplaintTable';
import CountUp from '@/components/CountUp';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// SupportTrack home: what needs attention, four figures and the complaints still open.
export default async function SupportHome({ searchParams }) {
  const user = await requireUser(SUPPORT_ROLES);
  const sp = await searchParams;
  await remindOverdue();
  const [st, open] = await Promise.all([stats(user), complaintRows(user, { status: 'open', limit: 50 })]);
  const mgr = isMgr(user);
  const mine = open.filter((c) => c.assigned_to === user.id);
  const unassigned = mgr ? open.filter((c) => !c.assigned_to) : [];

  return (
    <>
      <div className='head'>
        <div>
          <h1>Support Dashboard</h1>
          <p className='muted'>{mgr ? 'Every complaint raised, who is handling it and what is overdue.' : 'Complaints you raised or are handling.'}</p>
        </div>
        <Link href='/support/new' className='btn primary'>Record a complaint</Link>
      </div>
      <Flash sp={sp} />

      {st.overdue ? (
        <div className='attn'>
          <b>{st.overdue} complaint{st.overdue > 1 ? 's are' : ' is'} overdue</b>
          <span>These are past their due date and still open.</span>
          <Link className='btn primary' href='/support/list?status=overdue'>See overdue</Link>
        </div>
      ) : mine.length ? (
        <div className='attn'>
          <b>{mine.length} complaint{mine.length > 1 ? 's are' : ' is'} assigned to you</b>
          <span>{refOf(mine[0].id)}: {mine[0].title}</span>
          <Link className='btn primary' href={'/support/view?id=' + mine[0].id}>Open</Link>
        </div>
      ) : unassigned.length ? (
        <div className='attn'>
          <b>{unassigned.length} complaint{unassigned.length > 1 ? 's' : ''} not assigned yet</b>
          <span>{refOf(unassigned[0].id)}: {unassigned[0].title}</span>
          <Link className='btn primary' href={'/support/view?id=' + unassigned[0].id}>Assign</Link>
        </div>
      ) : null}

      <div className='kpis'>
        <div className='card kpi'><span>Open</span><b><CountUp value={st.open} prefix='' /></b><small>Not resolved yet</small></div>
        <div className={'card kpi alt' + (st.overdue ? ' neg' : '')}><span>Overdue</span><b><CountUp value={st.overdue} prefix='' /></b><small>Past the due date</small></div>
        <div className='card kpi alt'><span>High or urgent</span><b><CountUp value={st.hot} prefix='' /></b><small>Open and needing speed</small></div>
        <div className='card kpi'><span>Resolved this month</span><b><CountUp value={st.done} prefix='' /></b><small>Closed with a note</small></div>
      </div>

      <div className='card'>
        <h3>Open Complaints ({open.length})</h3>
        <ComplaintTable rows={open} empty='No open complaints.' />
        <p className='totals'><Link href='/support/list'>See all complaints, including resolved ones</Link></p>
      </div>
    </>
  );
}
