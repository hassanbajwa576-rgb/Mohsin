import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fundSummary, issueRows, receivedByFund } from '@/lib/queries';
import FundMatrix, { buildMatrix } from '@/components/FundMatrix';
import { addAdvance, deleteAdvance, deleteIssue, issueAdvance, recordReturn, returnToAccounts, deleteReturn } from '@/lib/actions';
import { pkr, today, FUNDS } from '@/lib/fmt';
import Flash from '@/components/Flash';
import FundCard from '@/components/FundCard';
import ConfirmButton from '@/components/ConfirmButton';

export default async function AdvancesPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const manage = user.role !== 'so';

  const [issues, funds, received, officers, returns] = await Promise.all([
    issueRows(user),
    manage ? fundSummary() : Promise.resolve(null),
    manage
      ? q(`SELECT a.id, a.fund, a.amount, a.reference, a.note, to_char(a.received_on, 'YYYY-MM-DD') AS received_on, u.name AS by_name FROM pc2_advances a LEFT JOIN pc2_users u ON u.id = a.created_by ORDER BY a.received_on DESC, a.id DESC LIMIT 200`)
      : Promise.resolve([]),
    manage
      ? q(`SELECT u.id, u.name, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.role = ANY($1::text[]) AND u.active ORDER BY u.role DESC, u.name`, [isOM ? ['so', 'sso'] : ['so']])
      : Promise.resolve([]),
    manage
      ? q(`SELECT r.id, r.fund, r.amount, r.reference, r.note, to_char(r.returned_on, 'YYYY-MM-DD') AS returned_on, u.name AS by_name FROM pc2_returns r LEFT JOIN pc2_users u ON u.id = r.returned_by ORDER BY r.returned_on DESC, r.id DESC LIMIT 100`)
      : Promise.resolve([]),
  ]);

  const recvByFund = manage ? await receivedByFund() : [];

  // Filters for the list of advances issued to the team.
  const fTo = sp.to || '';
  const fBy = ['om', 'sso'].includes(sp.by) ? sp.by : '';
  const fFund = FUNDS[sp.fund] ? sp.fund : '';
  const fMonth = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month : '';
  const fStatus = ['left', 'spent', 'returned'].includes(sp.status) ? sp.status : '';
  const holders = [...new Map(issues.map((i) => [i.issued_to, i.holder])).entries()];
  const shown = issues.filter((i) => {
    const left = i.amount - i.returned - Number(i.spent);
    if (fTo === 'me' ? i.issued_to !== user.id : fTo && String(i.issued_to) !== fTo) return false;
    if (fBy && i.issuer_role !== fBy) return false;
    if (fFund && i.fund !== fFund) return false;
    if (fMonth && i.issued_on.slice(0, 7) !== fMonth) return false;
    if (fStatus === 'left' && !(left > 0)) return false;
    if (fStatus === 'spent' && !(left <= 0)) return false;
    if (fStatus === 'returned' && !(i.returned > 0)) return false;
    return true;
  });
  const tIssued = shown.reduce((a, i) => a + i.amount, 0);
  const tSpent = shown.reduce((a, i) => a + Number(i.spent), 0);
  const tReturned = shown.reduce((a, i) => a + i.returned, 0);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Advances</h1>
          <p className='muted'>
            {manage ? 'Funds received from Accounts, and cash issued to Support Officers' : 'Cash issued to you by the Sr. Support Officer'}
          </p>
        </div>
      </div>
      <Flash sp={sp} />

      {funds ? (
        <>
          <h2 style={{ marginTop: 0 }}>Received from Accounts</h2>
          <div className='funds'>
            {funds.rows.map((f) => (
              <FundCard key={f.key} f={f} />
            ))}
          </div>

          <FundMatrix title='Received from Accounts by fund - PKR' cols={['Amount']} rows={buildMatrix(recvByFund, 'office', ['All'])} />

          {manage ? (
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
              {!isOM ? <p className='muted'>Funds you record here are held by you (the Sr. SO) and can be issued to Support Officers. The Sr. Ops Manager is notified.</p> : null}
            </details>
          ) : null}

          <div className='card'>
            {received.length === 0 ? <p className='muted'>No funds recorded from Accounts yet.</p> : (
              <div className='tablewrap'>
                <table>
                  <thead><tr><th>Date</th><th>Fund</th><th>Reference</th><th>Note</th><th>Recorded by</th><th className='r'>Amount</th>{isOM ? <th></th> : null}</tr></thead>
                  <tbody>
                    {received.map((a) => (
                      <tr key={a.id}>
                        <td className='nw'>{a.received_on}</td>
                        <td>{FUNDS[a.fund]}</td>
                        <td>{a.reference}</td>
                        <td>{a.note}</td>
                        <td>{a.by_name || '-'}</td>
                        <td className='r nw'><b>{pkr(a.amount)}</b></td>
                        {isOM ? (
                          <td className='act'>
                            <a href={'/advances/edit?type=received&id=' + a.id} className='btn'>Edit</a>
                            <form action={deleteAdvance} className='inline'>
                              <input type='hidden' name='id' value={a.id} />
                              <ConfirmButton className='btn ghost' message='Remove this funds entry? This cannot be undone.'>Remove</ConfirmButton>
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
          <details className='card'>
            <summary>Return cash to Accounts</summary>
            <form action={returnToAccounts} className='form'>
              <label>Date returned<input type='date' name='returned_on' defaultValue={today()} required /></label>
              <label>Fund
                <select name='fund'>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' required /></label>
              <label>Reference<input name='reference' placeholder='Voucher / receipt no.' /></label>
              <label className='wide'>Note<input name='note' placeholder='Optional' /></label>
              <button className='btn primary' type='submit'>Record return to Accounts</button>
            </form>
            <p className='muted'>{isOM ? 'Taken from the cash held by the Sr. Ops Manager.' : 'Taken from the cash you hold.'} It lowers Advances Outstanding and CIH.</p>
          </details>

          {returns.length > 0 ? (
            <div className='card'>
              <h3>Returned to Accounts</h3>
              <div className='tablewrap'>
                <table>
                  <thead><tr><th>Date</th><th>Fund</th><th>By</th><th>Reference</th><th>Note</th><th className='r'>Amount</th>{isOM ? <th></th> : null}</tr></thead>
                  <tbody>
                    {returns.map((r) => (
                      <tr key={r.id}>
                        <td className='nw'>{r.returned_on}</td>
                        <td>{FUNDS[r.fund]}</td>
                        <td>{r.by_name || '-'}</td>
                        <td>{r.reference}</td>
                        <td>{r.note}</td>
                        <td className='r nw'><b>{pkr(r.amount)}</b></td>
                        {isOM ? (
                          <td className='act'>
                            <form action={deleteReturn} className='inline'>
                              <input type='hidden' name='id' value={r.id} />
                              <ConfirmButton className='btn ghost' message='Remove this return? This cannot be undone.'>Remove</ConfirmButton>
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <h2>{manage ? 'Advances issued to the team' : 'My advances'}</h2>

      {manage ? (
        <details className='card' open>
          <summary>Issue an advance</summary>
          {officers.length === 0 ? (
            <p className='muted'>There is no active team member to issue to yet. The Sr. Ops Manager can add one from the Team page.</p>
          ) : (
            <form action={issueAdvance} className='form'>
              <label>Issue to
                <select name='issued_to' required>
                  {officers.map((o) => <option key={o.id} value={o.id}>{o.name + ' (' + (o.role === 'sso' ? 'Sr. SO' : 'SO') + ', ' + o.office + ')'}</option>)}
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

      <form method='get' className='card filters compact'>
        {manage ? (
          <label>Issued to
            <select name='to' defaultValue={fTo}>
              <option value=''>Everyone</option>
              {!isOM ? <option value='me'>Me</option> : null}
              {holders.filter(([id]) => id !== user.id).map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
            </select>
          </label>
        ) : null}
        {manage ? (
          <label>Issued by
            <select name='by' defaultValue={fBy}>
              <option value=''>Anyone</option>
              <option value='om'>Sr. Ops Manager</option>
              <option value='sso'>Sr. SO</option>
            </select>
          </label>
        ) : null}
        <label>Fund
          <select name='fund' defaultValue={fFund}>
            <option value=''>All</option>
            {Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Month<input type='month' name='month' defaultValue={fMonth} /></label>
        <label>Status
          <select name='status' defaultValue={fStatus}>
            <option value=''>All</option>
            <option value='left'>With cash left</option>
            <option value='spent'>Fully spent</option>
            <option value='returned'>Has a return</option>
          </select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <a href='/advances' className='btn ghost'>Reset</a>
      </form>

      {manage && issues.length > 0 ? (
        <FundMatrix
          title='Issued to the team by fund and office - PKR'
          cols={['LHR', 'ISB']}
          rows={buildMatrix(issues, 'office', ['LHR', 'ISB'])}
          note='By the office of the person the advance was issued to.'
        />
      ) : null}

      <div className='card'>
        {shown.length === 0 ? <p className='muted'>{issues.length === 0 ? 'No advances issued yet.' : 'No advances match these filters.'}</p> : (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>#</th><th>Date</th><th>Officer</th><th>Fund</th><th className='r'>Issued</th><th className='r'>Spent</th><th className='r'>Returned</th><th className='r'>In hand</th>{manage ? <th></th> : null}</tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const left = i.amount - i.returned - Number(i.spent);
                  return (
                    <tr key={i.id}>
                      <td>{i.id}</td>
                      <td className='nw'>{i.issued_on}</td>
                      <td><OfficeTag o={i.office} />{i.holder}{i.note ? <div className='muted'>{i.note}</div> : null}</td>
                      <td>{FUNDS[i.fund]}</td>
                      <td className='r nw'>{pkr(i.amount)}</td>
                      <td className='r nw'>{pkr(i.spent)}</td>
                      <td className='r nw'>{pkr(i.returned)}</td>
                      <td className='r nw'><b>{pkr(left)}</b></td>
                      {manage ? (
                        <td className='act'>
                          {isOM ? (
                            <div className='inline'>
                              <a href={'/advances/edit?type=issue&id=' + i.id} className='btn'>Edit</a>
                              <form action={deleteIssue} className='inline'>
                                <input type='hidden' name='id' value={i.id} />
                                <ConfirmButton className='btn ghost' message='Delete this advance? This cannot be undone.'>Delete</ConfirmButton>
                              </form>
                            </div>
                          ) : null}
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
        {shown.length > 0 ? (
          <p className='totals'>{shown.length} advance(s) - Issued <b>{pkr(tIssued)}</b> - Spent <b>{pkr(tSpent)}</b> - Returned <b>{pkr(tReturned)}</b> - In hand <b>{pkr(tIssued - tReturned - tSpent)}</b></p>
        ) : null}
      </div>
    </>
  );
}
