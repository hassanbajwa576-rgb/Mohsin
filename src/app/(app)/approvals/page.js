import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { EXP_COLS, EXP_FROM } from '@/lib/queries';
import { pkr } from '@/lib/fmt';
import { fmtDay, fmt12 } from '@/lib/att';
import { pendingDeletes } from '@/lib/visitors';
import { pendingRequests, TINFO } from '@/lib/roster';
import { decideVisitorDelete } from '@/lib/vis-actions';
import { decideTimeOff } from '@/lib/roster-actions';
import ExpenseTable from '@/components/ExpenseTable';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const span = (e) => e.from_date + (e.to_date !== e.from_date ? ' to ' + e.to_date : '') + (e.hours != null ? ' (' + Math.round(e.hours * 100) / 100 + ' h)' : '');

// Everything waiting for the Sr. Ops Manager's decision, in one place.
export default async function ApprovalsPage({ searchParams }) {
  const user = await requireUser(['om', 'sso', 'so', 'guard']);
  if (user.role !== 'om') redirect('/');
  const sp = await searchParams;
  const expenses = await q(`SELECT ${EXP_COLS} ${EXP_FROM} WHERE e.status IN ('submitted', 'verified') ORDER BY e.spent_on DESC, e.id DESC LIMIT 200`);
  const visitors = await pendingDeletes();
  const timeoff = await pendingRequests('');
  const imports = (await q("SELECT COUNT(*)::int AS n FROM pc2_import_review WHERE resolved_at IS NULL AND kind = 'conflict'"))[0].n;
  // Split expenses count once.
  const expCount = new Set(expenses.map((e) => e.split_group || 'e' + e.id)).size;
  const total = expCount + visitors.length + timeoff.length;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Approvals</h1>
          <p className='muted'>Everything waiting for your decision, in one place.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='kpis'>
        <div className={'card kpi' + (total ? ' neg' : '')}><span>Waiting for you</span><b>{total}</b></div>
        <div className='card kpi alt'><span>Expenses</span><b>{expCount}</b><small>{pkr(expenses.reduce((a, e) => a + Number(e.amount), 0))}</small></div>
        <div className='card kpi alt'><span>Time off requests</span><b>{timeoff.length}</b></div>
        <div className='card kpi alt'><span>Visitor delete requests</span><b>{visitors.length}</b></div>
      </div>

      {!total && !imports ? <div className='card'><p className='muted' style={{ margin: 0 }}>Nothing is waiting for you.</p></div> : null}

      {expenses.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Expenses To Approve ({expCount})</h3>
          <ExpenseTable rows={expenses} user={user} back='/approvals' />
        </div>
      ) : null}

      {timeoff.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Time Off Requests ({timeoff.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Team member</th><th>Type</th><th>When</th><th>Asked by</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {timeoff.map((e) => (
                  <tr key={e.id}>
                    <td className='c-title'><OfficeTag o={e.office} /><b>{e.name}</b></td>
                    <td className='c-meta'><span className='rostag' style={{ background: TINFO[e.kind].color }}>{TINFO[e.kind].label}</span></td>
                    <td className='nw c-meta'>{span(e)}</td>
                    <td className='c-meta'>{e.req_name || '-'}</td>
                    <td className='c-meta'>{e.note || ''}</td>
                    <td className='act'>
                      <form action={decideTimeOff} className='inline'>
                        <input type='hidden' name='id' value={e.id} />
                        <input type='hidden' name='back' value='/approvals' />
                        <button name='decision' value='approve' className='btn ok' type='submit'>Approve</button>
                        <button name='decision' value='decline' className='btn bad' type='submit'>Decline</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {visitors.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Visitor Delete Requests ({visitors.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Visitor</th><th>Requested by</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id}>
                    <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b><div className='muted'>{fmtDay(v.in_ms)}, {fmt12(v.in_ms)}</div></td>
                    <td className='c-meta'>{v.req_name}</td>
                    <td className='c-meta'>{v.del_reason}</td>
                    <td className='act'>
                      <form action={decideVisitorDelete} className='inline'>
                        <input type='hidden' name='id' value={v.id} />
                        <input type='hidden' name='back' value='/approvals' />
                        <button name='decision' value='approve' className='btn bad' type='submit'>Approve delete</button>
                        <button name='decision' value='keep' className='btn' type='submit'>Keep record</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {imports ? (
        <div className='card'>
          <b>{imports} day{imports > 1 ? 's' : ''} from an Excel import still need a decision.</b>{' '}
          <Link href='/attendance/import'>Open the import review list</Link>
        </div>
      ) : null}
    </>
  );
}