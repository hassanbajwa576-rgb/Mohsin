import { decideExpense, deleteExpense } from '@/lib/actions';
import { pkr, FUNDS, STATUS_LABEL } from '@/lib/fmt';
import ConfirmButton from './ConfirmButton';

export default function ExpenseTable({ rows, user, back = '/expenses', actions = true }) {
  if (!rows.length) return <p className='muted'>Nothing to show yet.</p>;
  const isOM = user.role === 'om';
  const isSSO = user.role === 'sso';
  return (
    <div className='tablewrap'>
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Office</th><th>Details</th><th>Fund</th><th>By</th><th className='r'>Amount</th><th>Stage</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canDecide = actions && ((r.status === 'submitted' && (isOM || isSSO)) || (r.status === 'verified' && isOM));
            const canEdit = actions && isOM && r.status !== 'sent';
            const canDelete = actions && (isOM || (user.role === 'so' && ['draft', 'submitted'].includes(r.status) && r.submitted_by === user.id));
            return (
              <tr key={r.id}>
                <td className='nw'>{r.spent_on}</td>
                <td><span className='pill'>{r.office}</span></td>
                <td>
                  <b>{r.category}</b>
                  {r.description ? <div className='muted'>{r.description}</div> : null}
                  {r.issue_id ? <div className='muted'>Advance #{r.issue_id}</div> : null}
                  {r.decision_note ? <div className='muted'>Note: {r.decision_note}</div> : null}
                </td>
                <td>{FUNDS[r.fund]}</td>
                <td>{r.submitter}</td>
                <td className='r nw'><b>{pkr(r.amount)}</b></td>
                <td><span className={'badge ' + r.status}>{STATUS_LABEL[r.status]}</span></td>
                <td className='act'>
                  {canDecide ? (
                    <form action={decideExpense} className='inline'>
                      <input type='hidden' name='id' value={r.id} />
                      <input type='hidden' name='back' value={back} />
                      <input name='note' placeholder='Note (optional)' className='sm' />
                      <button name='decision' value='approve' className='btn ok' type='submit'>{isOM ? 'Approve' : 'Verify'}</button>
                      <button name='decision' value='reject' className='btn bad' type='submit'>Reject</button>
                    </form>
                  ) : null}
                  {canEdit ? (
                    <div className='inline'><a href={'/expenses/edit?id=' + r.id} className='btn'>Edit</a></div>
                  ) : null}
                  {canDelete ? (
                    <form action={deleteExpense} className='inline'>
                      <input type='hidden' name='id' value={r.id} />
                      <input type='hidden' name='back' value={back} />
                      <ConfirmButton className='btn ghost' message={r.status === 'sent' ? 'This expense was already sent to Accounts. Delete it anyway? This cannot be undone.' : 'Delete this expense? This cannot be undone.'}>Delete</ConfirmButton>
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
