import { decideExpense, deleteExpense } from '@/lib/actions';
import { pkr, FUNDS, STATUS_LABEL } from '@/lib/fmt';

export default function ExpenseTable({ rows, user, back = '/expenses' }) {
  if (!rows.length) return <p className='muted'>Nothing to show yet.</p>;
  const isOM = user.role === 'om';
  return (
    <div className='tablewrap'>
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Office</th><th>Details</th><th>Fund</th><th>By</th><th className='r'>Amount</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canDelete = isOM || (r.status === 'pending' && r.submitted_by === user.id);
            return (
              <tr key={r.id}>
                <td className='nw'>{r.spent_on}</td>
                <td><span className='pill'>{r.office}</span></td>
                <td>
                  <b>{r.category}</b>
                  {r.description ? <div className='muted'>{r.description}</div> : null}
                  {r.decision_note ? <div className='muted'>Note: {r.decision_note}</div> : null}
                </td>
                <td>{FUNDS[r.fund]}</td>
                <td>{r.submitter}</td>
                <td className='r nw'><b>{pkr(r.amount)}</b></td>
                <td><span className={'badge ' + r.status}>{STATUS_LABEL[r.status]}</span></td>
                <td className='act'>
                  {isOM && r.status === 'pending' ? (
                    <form action={decideExpense} className='inline'>
                      <input type='hidden' name='id' value={r.id} />
                      <input type='hidden' name='back' value={back} />
                      <input name='note' placeholder='Note (optional)' className='sm' />
                      <button name='decision' value='approve' className='btn ok' type='submit'>Approve</button>
                      <button name='decision' value='reject' className='btn bad' type='submit'>Reject</button>
                    </form>
                  ) : null}
                  {canDelete ? (
                    <form action={deleteExpense} className='inline'>
                      <input type='hidden' name='id' value={r.id} />
                      <input type='hidden' name='back' value={back} />
                      <button className='btn ghost' type='submit'>Delete</button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
