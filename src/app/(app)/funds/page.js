import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fundBalances } from '@/lib/queries';
import { addAdvance, deleteAdvance } from '@/lib/actions';
import { pkr, today, FUNDS } from '@/lib/fmt';
import Flash from '@/components/Flash';

export default async function FundsPage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const [bal, adv] = await Promise.all([
    fundBalances(),
    q(`SELECT a.id, a.fund, a.amount, a.reference, a.note, to_char(a.received_on, 'YYYY-MM-DD') AS received_on FROM pc2_advances a ORDER BY a.received_on DESC, a.id DESC LIMIT 200`),
  ]);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Funds</h1>
          <p className='muted'>Advances received from the Accounts team (Petty, BRC, Others)</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='funds'>
        {bal.rows.map((f) => (
          <div className='card fund' key={f.key}>
            <div className='fund-h'><b>{f.label}</b><span className={f.balance < 0 ? 'neg-t' : ''}>{pkr(f.balance)}</span></div>
            <div className='track'><div className='fill' style={{ width: Math.min(100, f.received ? (f.spent / f.received) * 100 : 0) + '%' }} /></div>
            <small className='muted'>Received {pkr(f.received)} - Spent {pkr(f.spent)}{f.pending ? ' - Pending ' + pkr(f.pending) : ''}</small>
          </div>
        ))}
      </div>

      <details className='card' open>
        <summary>Record advance received</summary>
        <form action={addAdvance} className='form'>
          <label>Date received<input type='date' name='received_on' defaultValue={today()} required /></label>
          <label>Fund
            <select name='fund'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
          <label>Reference<input name='reference' placeholder='Voucher / cheque no.' /></label>
          <label className='wide'>Note<input name='note' placeholder='Optional' /></label>
          <button className='btn primary' type='submit'>Record advance</button>
        </form>
      </details>

      <h2>Advance history</h2>
      <div className='card'>
        {adv.length === 0 ? <p className='muted'>No advances recorded yet.</p> : (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>Date</th><th>Fund</th><th>Reference</th><th>Note</th><th className='r'>Amount</th><th></th></tr></thead>
              <tbody>
                {adv.map((a) => (
                  <tr key={a.id}>
                    <td className='nw'>{a.received_on}</td>
                    <td>{FUNDS[a.fund]}</td>
                    <td>{a.reference}</td>
                    <td>{a.note}</td>
                    <td className='r nw'><b>{pkr(a.amount)}</b></td>
                    <td className='act'>
                      <form action={deleteAdvance} className='inline'>
                        <input type='hidden' name='id' value={a.id} />
                        <button className='btn ghost' type='submit'>Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
