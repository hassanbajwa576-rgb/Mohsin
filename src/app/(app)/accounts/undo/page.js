import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { todayPlan } from '@/lib/undo-today';
import { undoToday } from '@/lib/undo-actions';
import { pkr } from '@/lib/fmt';
import ConfirmButton from '@/components/ConfirmButton';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

const STATE = { draft: 'Not yet submitted', submitted: 'Awaiting review', approved: 'Approved', sent: 'Sent to Accounts', rejected: 'Rejected' };

export default async function UndoTodayPage({ searchParams }) {
  const user = await requireUser(['om']);
  const sp = await searchParams;
  const p = await todayPlan(user.id);
  return (
    <>
      <div className='head'>
        <div>
          <h1>Undo Today</h1>
          <p className='muted'>Everything you did to expenses today: batches sent to Accounts, approvals and rejections, expenses you added, and edits. Check the list, then undo it all in one go.</p>
        </div>
        <Link href='/accounts' className='btn ghost'>Back to Accounts</Link>
      </div>
      <Flash sp={sp} />

      {p.empty ? <div className='card'><p className='muted'>Nothing to undo. You have not changed any expenses today.</p></div> : (
        <>
          <div className='card'>
            <h3>What will happen</h3>
            <ul>
              {p.batches.length ? <li>{p.batches.length} batch(es) sent to Accounts are taken apart: {p.batches.map((b) => '#' + b.id + ' (' + b.item_count + ' expenses, ' + pkr(b.total) + ')').join(', ')}. The expenses go back to Approved, ready to submit again.</li> : null}
              {p.decided.length ? <li>{p.decided.length} expense(s) you approved or rejected today go back to Awaiting review.</li> : null}
              {p.created.length ? <li>{p.created.length} expense(s) you added today are removed.</li> : null}
              {p.restore.length ? <li>{p.restore.length} expense(s) you edited today go back to their earlier values.</li> : null}
              {p.bring.length ? <li>{p.bring.length} expense(s) you deleted today come back, each under the name of the person who added it.</li> : null}
            </ul>
            <p className='muted'>The audit log keeps a copy of everything removed or changed. If a batch was already downloaded or sent on to the Accounts team, tell them it was withdrawn.</p>
            <form action={undoToday}>
              <ConfirmButton className='btn primary' message="Undo all of today's expense changes?">Undo everything from today</ConfirmButton>
            </form>
          </div>

          {p.batches.length ? (
            <div className='card'>
              <h3>Batches sent to Accounts today</h3>
              <div className='tablewrap'>
                <table className='tx'>
                  <thead><tr><th>Batch</th><th>Note</th><th className='r'>Expenses</th><th className='r'>Total</th></tr></thead>
                  <tbody>{p.batches.map((b) => <tr key={b.id}><td className='c-title'><b>#{b.id}</b></td><td className='c-meta'>{b.note}</td><td className='r c-meta'>{b.item_count}</td><td className='r nw c-amt'><b>{pkr(b.total)}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {p.decided.length ? (
            <div className='card'>
              <h3>Approved or rejected today</h3>
              <div className='tablewrap'>
                <table className='tx'>
                  <thead><tr><th>#</th><th>Expense</th><th>Now</th><th className='r'>Amount</th></tr></thead>
                  <tbody>{p.decided.map((r) => <tr key={r.id}><td className='c-meta'>{r.id}</td><td className='c-title'><b>{r.category}</b>{r.description ? <div className='muted'>{r.description}</div> : null}</td><td className='c-meta'>{STATE[r.status] || r.status}</td><td className='r nw c-amt'><b>{pkr(r.amount)}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {p.created.length ? (
            <div className='card'>
              <h3>Added today (will be removed)</h3>
              <div className='tablewrap'>
                <table className='tx'>
                  <thead><tr><th>#</th><th>Expense</th><th>Now</th><th className='r'>Amount</th></tr></thead>
                  <tbody>{p.created.map((r) => <tr key={r.id}><td className='c-meta'>{r.id}</td><td className='c-title'><b>{r.category}</b>{r.description ? <div className='muted'>{r.description}</div> : null}</td><td className='c-meta'>{STATE[r.status] || r.status}</td><td className='r nw c-amt'><b>{pkr(r.amount)}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {p.bring.length ? (
            <div className='card'>
              <h3>Deleted today (will come back)</h3>
              <div className='tablewrap'>
                <table className='tx'>
                  <thead><tr><th>#</th><th>Expense</th><th>Added by</th><th>State</th><th className='r'>Amount</th></tr></thead>
                  <tbody>{p.bring.map((r) => <tr key={r.id}><td className='c-meta'>{r.id}</td><td className='c-title'><b>{r.category}</b>{r.description ? <div className='muted'>{r.description}</div> : null}<div className='muted'>{r.spent_on}, {r.office}</div></td><td className='c-meta'>{r.creator}</td><td className='c-meta'>{STATE[r.status === 'sent' ? 'approved' : r.status] || r.status}</td><td className='r nw c-amt'><b>{pkr(r.amount)}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {p.unknown.length ? (
            <div className='card'>
              <h3>Deleted today, cannot be brought back automatically</h3>
              <p className='muted'>The audit log does not say who added these, so they are left out. Tell me and I will add them by hand.</p>
              <ul>{p.unknown.map((r) => <li key={r.id}>#{r.id} {r.category} {pkr(r.amount)} on {r.spent_on}{r.description ? ' (' + r.description + ')' : ''}</li>)}</ul>
            </div>
          ) : null}

          {p.restore.length ? (
            <div className='card'>
              <h3>Edited today (will be put back)</h3>
              <ul>{p.restore.map((r) => <li key={r.id}>#{r.id} {r.category}: {r.changes.map((c) => c.field + ' ' + c.was + ' back to ' + c.back).join('; ')}</li>)}</ul>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
