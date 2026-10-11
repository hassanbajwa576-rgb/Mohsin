import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fundSummary, issueRows } from '@/lib/queries';
import { addAdvance, deleteAdvance, issueAdvance, recordReturn } from '@/lib/actions';
import { pkr, today, FUNDS } from '@/lib/fmt';
import Flash from '@/components/Flash';

export default async function AdvancesPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const manage = user.role !== 'so';

  const [issues, funds, received, officers] = await Promise.all([
    issueRows(user),
    manage ? fundSummary() : Promise.resolve(null),
    manage
      ? q(`SELECT a.id, a.fund, a.amount, a.reference, a.note, to_char(a.received_on, 'YYYY-MM-DD') AS received_on FROM pc2_advances a ORDER BY a.received_on DESC, a.id DESC LIMIT 200`)
      : Promise.resolve([]),
    manage
      ? q(`SELECT u.id, u.name, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.role = ANY($1::text[]) AND u.active ORDER BY u.role DESC, u.name`, [isOM ? ['so', 'sso'] : ['so']])
      : Promise.resolve([]),
  ]);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Advances</h1>
          <p className='muted'>
            {manage ? 'Funds received from Accounts, and cash issued to Support Officers' : 'Cash issued to you by the Senior Support Officer'}
          </p>
        </div>
      </div>
      <Flash sp={sp} />

      {funds ? (
        <>
          <h2 style={{ marginTop: 0 }}>Received from Accounts</h2>
          <div className='funds'>
            {funds.rows.map((f) => (
              <div className='card fund' key={f.key}>
                <div className='fund-h'><b>{f.label}</b><span className={f.pool < 0 ? 'neg-t' : ''}>{pkr(f.pool)}</span></div>
                <div className='track'><div className='fill' style={{ width: Math.min(100, f.received ? ((f.received - f.pool) / f.received) * 100 : 0) + '%' }} /></div>
                <small className='muted'>Received {pkr(f.received)} - Issued to SO {pkr(f.issued)} - Spent {pkr(f.spent)}</small>
                <small className='muted'>With Operations (pool): {pkr(f.pool)} - With SSO: {pkr(f.ssoCash)} - With SOs: {pkr(f.soCash)}</small>
              </div>
            ))}
          </div>

          {isOM ? (
            <details className='card'>
              <summary>Record funds received from Accounts</summary>
              <form action={addAdvance} className='form'>
                <label>Date received<input type='date' name='received_on' defaultValue={today()} required /></label>
                <label>Fund
                  <select name='fund'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </label>
                <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
                <label>Reference<input name='reference' placeholder='Voucher / cheque no.' /></label>
                <label className='wide'>Note<input name='note' placeholder='Optional' /></label>
                <button className='btn primary' type='submit'>Record funds</button>
              </form>
            </details>
          ) : null}

          <div className='card'>
            {received.length === 0 ? <p className='muted'>No funds recorded from Accounts yet.</p> : (
              <div className='tablewrap'>
                <table>
                  <thead><tr><th>Date</th><th>Fund</th><th>Reference</th><th>Note</th><th className='r'>Amount</th>{isOM ? <th></th> : null}</tr></thead>
                  <tbody>
                    {received.map((a) => (
                      <tr key={a.id}>
                        <td className='nw'>{a.received_on}</td>
                        <td>{FUNDS[a.fund]}</td>
                        <td>{a.reference}</td>
                        <td>{a.note}</td>
                        <td className='r nw'><b>{pkr(a.amount)}</b></td>
                        {isOM ? (
                          <td className='act'>
                            <a href={'/advances/edit?type=received&id=' + a.id} className='btn'>Edit</a>
                            <form action={deleteAdvance} className='inline'>
                              <input type='hidden' name='id' value={a.id} />
                              <button className='btn ghost' type='submit'>Remove</button>
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      <h2>{manage ? 'Advances issued to the team' : 'My advances'}</h2>

      {manage ? (
        <details className='card' open>
          <summary>Issue an advance</summary>
          {officers.length === 0 ? (
            <p className='muted'>There is no active team member to issue to yet. The Operations Manager can add one from the Team page.</p>
          ) : (
            <form action={issueAdvance} className='form'>
              <label>Issue to
                <select name='issued_to' required>
                  {officers.map((o) => <option key={o.id} value={o.id}>{o.name + ' (' + (o.role === 'sso' ? 'SSO' : 'SO') + ', ' + o.office + ')'}</option>)}
                </select>
              </label>
              <label>From fund
                <select name='fund' defaultValue='petty'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
              <label>Date<input type='date' name='issued_on' defaultValue={today()} required /></label>
              <label className='wide'>Note<input name='note' placeholder='Purpose of the advance (optional)' /></label>
              <button className='btn primary' type='submit'>Issue advance</button>
            </form>
          )}
        </details>
      ) : null}

      <div className='card'>
        {issues.length === 0 ? <p className='muted'>No advances issued yet.</p> : (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>#</th><th>Date</th><th>Officer</th><th>Fund</th><th className='r'>Issued</th><th className='r'>Spent</th><th className='r'>Returned</th><th className='r'>In hand</th>{manage ? <th></th> : null}</tr>
              </thead>
              <tbody>
                {issues.map((i) => {
                  const left = i.amount - i.returned - Number(i.spent);
                  return (
                    <tr key={i.id}>
                      <td>{i.id}</td>
                      <td className='nw'>{i.issued_on}</td>
                      <td>{i.holder}{i.note ? <div className='muted'>{i.note}</div> : null}</td>
                      <td>{FUNDS[i.fund]}</td>
                      <td className='r nw'>{pkr(i.amount)}</td>
                      <td className='r nw'>{pkr(i.spent)}</td>
                      <td className='r nw'>{pkr(i.returned)}</td>
                      <td className='r nw'><b>{pkr(left)}</b></td>
                      {manage ? (
                        <td className='act'>
                          {isOM ? <div className='inline'><a href={'/advances/edit?type=issue&id=' + i.id} className='btn'>Edit</a></div> : null}
                          {left > 0 ? (
                            <form action={recordReturn} className='inline'>
                              <input type='hidden' name='issue_id' value={i.id} />
                              <input name='amount' type='number' min='1' max={left} step='1' placeholder='Cash returned' className='sm' required />
                              <button className='btn' type='submit'>Record return</button>
                            </form>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
