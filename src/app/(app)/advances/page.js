import OfficeTag from '@/components/OfficeTag';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { fundSummary, issueRows, receivedByFund, payeeRows } from '@/lib/queries';
import FundMatrix, { buildMatrix } from '@/components/FundMatrix';
import { addAdvance, deleteAdvance, deleteIssue, issueAdvance, recordReturn, returnToAccounts, deleteReturn } from '@/lib/actions';
import { pkr, today, FUNDS } from '@/lib/fmt';
import Flash from '@/components/Flash';
import ScrollTo from '@/components/ScrollTo';
import FundCard from '@/components/FundCard';
import ConfirmButton from '@/components/ConfirmButton';
import FundTypes from '@/components/FundTypes';

export default async function AdvancesPage({ searchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isOM = user.role === 'om';
  const manage = user.role !== 'so';

  const [issuesRaw, funds, received, officers, payeesAll, returns] = await Promise.all([
    issueRows(user),
    manage ? fundSummary() : Promise.resolve(null),
    manage
      ? q(`SELECT a.id, a.fund, a.amount, a.reference, a.note, to_char(a.received_on, 'YYYY-MM-DD') AS received_on, a.created_by, u.name AS by_name, u.role AS by_role, ou.code AS by_office FROM pc2_advances a LEFT JOIN pc2_users u ON u.id = a.created_by LEFT JOIN pc2_offices ou ON ou.id = u.office_id ORDER BY a.received_on DESC, a.id DESC LIMIT 200`)
      : Promise.resolve([]),
    manage
      ? q(`SELECT u.id, u.name, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.role = ANY($1::text[]) AND u.active ORDER BY u.role DESC, u.name`, [isOM ? ['so', 'sso'] : ['so']])
      : Promise.resolve([]),
    manage ? payeeRows() : Promise.resolve([]),
    manage
      ? q(`SELECT r.id, r.fund, r.amount, r.reference, r.note, to_char(r.returned_on, 'YYYY-MM-DD') AS returned_on, u.name AS by_name FROM pc2_returns r LEFT JOIN pc2_users u ON u.id = r.returned_by ORDER BY r.returned_on DESC, r.id DESC LIMIT 100`)
      : Promise.resolve([]),
  ]);

  const recvByFund = manage ? await receivedByFund() : [];
  const activePayees = payeesAll.filter((p) => p.active);

  // The Sr. SO does not pick an advance when spending, so what they spent, passed on to Support
  // Officers or returned to Accounts is applied to their advances and receipts oldest first.
  let issues = issuesRaw;
  let allocBy = {};
  if (manage) {
    const [sExp, sOut, sRet] = await Promise.all([
      q(`SELECT e.submitted_by AS uid, e.fund, SUM(e.amount)::float8 AS v FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by WHERE u.role = 'sso' AND e.status <> 'rejected' GROUP BY 1, 2`),
      q(`SELECT i.issued_by AS uid, i.fund, SUM(i.amount - i.returned)::float8 AS v FROM pc2_issues i JOIN pc2_users u ON u.id = i.issued_by WHERE u.role = 'sso' GROUP BY 1, 2`),
      q(`SELECT r.returned_by AS uid, r.fund, SUM(r.amount)::float8 AS v FROM pc2_returns r JOIN pc2_users u ON u.id = r.returned_by WHERE u.role = 'sso' GROUP BY 1, 2`),
    ]);
    const pool = {};
    const add = (rows, k) => rows.forEach((r) => {
      const key = r.uid + '|' + r.fund;
      pool[key] = pool[key] || { spent: 0, ret: 0 };
      pool[key][k] += Number(r.v);
    });
    add(sExp, 'spent');
    add(sOut, 'spent');
    add(sRet, 'ret');
    const sources = [
      ...issuesRaw.filter((i) => i.holder_role === 'sso').map((i) => ({ k: 'I' + i.id, uid: i.issued_to, fund: i.fund, on: i.issued_on, id: i.id, avail: i.amount - i.returned })),
      ...received.filter((r) => r.by_role === 'sso').map((r) => ({ k: 'A' + r.id, uid: r.created_by, fund: r.fund, on: r.received_on, id: r.id, avail: r.amount })),
    ].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.id - b.id));
    for (const s of sources) {
      const pl = pool[s.uid + '|' + s.fund] || { spent: 0, ret: 0 };
      const useSpent = Math.min(s.avail, pl.spent);
      pl.spent -= useSpent;
      s.avail -= useSpent;
      const useRet = Math.min(s.avail, pl.ret);
      pl.ret -= useRet;
      s.avail -= useRet;
      allocBy[s.k] = { spent: useSpent, ret: useRet };
    }
    issues = issuesRaw.map((i) => (allocBy['I' + i.id] ? { ...i, spent: allocBy['I' + i.id].spent, returned: i.returned + allocBy['I' + i.id].ret } : i));
  }

  // Filters for the list of advances issued to the team. A row issued to a payee (no app account) has no issued_to,
  // so every person - real team member or payee - is identified by this key instead.
  const recipKey = (i) => (i.issued_to ? 'u' + i.issued_to : 'p' + i.payee_id);
  const fTo = sp.to || '';
  const fBy = ['om', 'sso', 'accounts'].includes(sp.by) ? sp.by : '';
  const fFund = FUNDS[sp.fund] ? sp.fund : '';
  const fMonth = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month : '';
  const fStatus = ['left', 'spent', 'returned'].includes(sp.status) ? sp.status : '';
  const holders = [...new Map(issues.map((i) => [recipKey(i), i.holder])).entries()];
  const shown = issues.filter((i) => {
    const left = i.amount - i.returned - Number(i.spent);
    if (fTo === 'me' ? i.issued_to !== user.id : fTo && recipKey(i) !== fTo) return false;
    if (fBy && i.issuer_role !== fBy) return false;
    if (fFund && i.fund !== fFund) return false;
    if (fMonth && i.issued_on.slice(0, 7) !== fMonth) return false;
    if (fStatus === 'left' && !(left > 0)) return false;
    if (fStatus === 'spent' && !(left <= 0)) return false;
    if (fStatus === 'returned' && !(i.returned > 0)) return false;
    return true;
  });
  // A person's In hand figures turn red once their cash in hand is below 20% of everything issued to them.
  const given = {};
  const kept = {};
  issues.forEach((i) => {
    const k = recipKey(i);
    given[k] = (given[k] || 0) + i.amount;
    kept[k] = (kept[k] || 0) + (i.amount - i.returned - Number(i.spent));
  });
  const lowCash = (who) => given[who] > 0 && kept[who] < 0.2 * given[who];
  const goodCash = (who) => given[who] > 0 && kept[who] >= 0.2 * given[who];
  const tIssued = shown.reduce((a, i) => a + i.amount, 0);
  const tSpent = shown.reduce((a, i) => a + Number(i.spent), 0);
  const tReturned = shown.reduce((a, i) => a + i.returned, 0);

  // Funds the Sr. SO recorded as received straight from Accounts, shown beside the advances issued to the team.
  const directAll = received
    .filter((r) => r.by_role === 'sso')
    .map((r) => ({ kind: 'accounts', id: r.id, fund: r.fund, amount: r.amount, issued_on: r.received_on, holder: r.by_name, issued_to: r.created_by, office: r.by_office, note: r.reference || r.note || '', spent: (allocBy['A' + r.id] || {}).spent || 0, returned: (allocBy['A' + r.id] || {}).ret || 0 }));
  const direct = fStatus ? [] : directAll.filter((r) => {
    if (fTo === 'me' ? r.issued_to !== user.id : fTo && 'u' + r.issued_to !== fTo) return false;
    if (fBy && fBy !== 'accounts') return false;
    if (fFund && r.fund !== fFund) return false;
    if (fMonth && r.issued_on.slice(0, 7) !== fMonth) return false;
    return true;
  });
  const rowsAll = [...shown, ...direct].sort((a, b) => (a.issued_on < b.issued_on ? 1 : a.issued_on > b.issued_on ? -1 : 0));
  const tDirect = direct.reduce((a, r) => a + r.amount, 0);

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
      {isOM && !user.impersonatedBy ? <FundTypes /> : null}

      {funds ? (
        <>
          <h2 style={{ marginTop: 0 }}>Received from Accounts</h2>
          <div className='funds'>
            {funds.rows.filter((f) => f.received || f.spent || f.sent || f.returned || f.outstanding || f.remaining).map((f) => (
              <FundCard key={f.key} f={f} />
            ))}
          </div>
          {funds.rows.some((f) => !(f.received || f.spent || f.sent || f.returned || f.outstanding || f.remaining)) ? (
            <p className='muted fund-empty'>{funds.rows.filter((f) => !(f.received || f.spent || f.sent || f.returned || f.outstanding || f.remaining)).map((f) => f.label).join(', ')}: nothing recorded yet (all PKR 0)</p>
          ) : null}

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
                <table className='tx'>
                  <thead><tr><th>Date</th><th>Fund</th><th>Reference</th><th>Note</th><th>Recorded by</th><th className='r'>Amount</th>{isOM ? <th></th> : null}</tr></thead>
                  <tbody>
                    {received.map((a) => (
                      <tr key={a.id}>
                        <td className='nw c-meta'>{a.received_on}</td>
                        <td className='c-title'>{FUNDS[a.fund]}</td>
                        <td className='c-meta'>{a.reference}</td>
                        <td className='c-meta'>{a.note}</td>
                        <td className='c-meta'>{a.by_name || '-'}</td>
                        <td className='r nw c-amt'><b>{pkr(a.amount)}</b></td>
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
                <table className='tx'>
                  <thead><tr><th>Date</th><th>Fund</th><th>By</th><th>Reference</th><th>Note</th><th className='r'>Amount</th>{isOM ? <th></th> : null}</tr></thead>
                  <tbody>
                    {returns.map((r) => (
                      <tr key={r.id}>
                        <td className='nw c-meta'>{r.returned_on}</td>
                        <td className='c-title'>{FUNDS[r.fund]}</td>
                        <td className='c-meta'>{r.by_name || '-'}</td>
                        <td className='c-meta'>{r.reference}</td>
                        <td className='c-meta'>{r.note}</td>
                        <td className='r nw c-amt'><b>{pkr(r.amount)}</b></td>
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
          {officers.length === 0 && activePayees.length === 0 ? (
            <p className='muted'>There is no active team member to issue to yet. The Sr. Ops Manager can add one from the Team page.</p>
          ) : (
            <form action={issueAdvance} className='form'>
              <label>Issue to
                <select name='recipient' required>
                  {officers.length ? (
                    <optgroup label='Team members'>
                      {officers.map((o) => <option key={'u' + o.id} value={'u-' + o.id}>{o.name + ' (' + (o.role === 'sso' ? 'Sr. SO' : 'SO') + ', ' + o.office + ')'}</option>)}
                    </optgroup>
                  ) : null}
                  {activePayees.length ? (
                    <optgroup label='Advance-only team members (no app account)'>
                      {activePayees.map((p) => <option key={'p' + p.id} value={'p-' + p.id}>{p.name + ' (' + p.office + ')'}</option>)}
                    </optgroup>
                  ) : null}
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

      <ScrollTo id='issued' when={!!(fTo || fBy || fFund || fMonth || fStatus)} />
      <form method='get' action='/advances#issued' id='issued' className='card filters compact' style={{ scrollMarginTop: 90 }}>
        {manage ? (
          <label>Issued to
            <select name='to' defaultValue={fTo}>
              <option value=''>Everyone</option>
              {!isOM ? <option value='me'>Me</option> : null}
              {holders.filter(([k]) => k !== 'u' + user.id).map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>
        ) : null}
        {manage ? (
          <label>Issued by
            <select name='by' defaultValue={fBy}>
              <option value=''>Anyone</option>
              <option value='accounts'>Accounts</option>
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
        <a href='/advances#issued' className='btn ghost'>Reset</a>
      </form>

      {manage && rowsAll.length > 0 ? (
        <FundMatrix
          title='Issued to the team by fund and office - PKR'
          cols={['LHR', 'ISB']}
          rows={buildMatrix(rowsAll, 'office', ['LHR', 'ISB'])}
          note='By the office of the person the advance was issued to, including funds the Sr. SO received straight from Accounts. Follows the filters above.'
        />
      ) : null}

      <div className='card'>
        {rowsAll.length === 0 ? <p className='muted'>{issues.length === 0 ? 'No advances issued yet.' : 'No advances match these filters.'}</p> : (
          <div className='tablewrap'>
            <table>
              <thead>
                <tr><th>#</th><th>Date</th><th>Officer</th><th>Fund</th><th className='r'>Issued</th><th className='r'>Spent</th><th className='r'>Returned</th><th className='r'>In hand</th>{manage ? <th></th> : null}</tr>
              </thead>
              <tbody>
                {rowsAll.map((i) => {
                  if (i.kind === 'accounts') {
                    return (
                      <tr key={'a' + i.id}>
                        <td>-</td>
                        <td className='nw'>{i.issued_on}</td>
                        <td><OfficeTag o={i.office} />{i.holder}<div className='muted'>From Accounts{i.note ? ' - ' + i.note : ''}</div></td>
                        <td>{FUNDS[i.fund]}</td>
                        <td className='r nw'>{pkr(i.amount)}</td>
                        <td className='r nw'>{pkr(i.spent)}</td>
                        <td className='r nw'>{pkr(i.returned)}</td>
                        <td className='r nw'><b>{pkr(i.amount - i.returned - i.spent)}</b></td>
                        {manage ? <td></td> : null}
                      </tr>
                    );
                  }
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
                      <td className='r nw'><b style={lowCash(recipKey(i)) ? { color: 'var(--bad, #b3261e)', background: '#fbd3d3', padding: '1px 7px', borderRadius: 3, display: 'inline-block' } : goodCash(recipKey(i)) ? { color: '#1b6e34', background: '#d9f1df', padding: '1px 7px', borderRadius: 3, display: 'inline-block' } : undefined}>{pkr(left)}</b></td>
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
          <p className='totals'>Issued to the team: {shown.length} advance(s) - Issued <b>{pkr(tIssued)}</b> - Spent <b>{pkr(tSpent)}</b> - Returned <b>{pkr(tReturned)}</b> - In hand <b>{pkr(tIssued - tReturned - tSpent)}</b></p>
        ) : null}
        {direct.length > 0 ? (
          <p className='totals'>From Accounts (recorded by the Sr. SO): {direct.length} entr{direct.length === 1 ? 'y' : 'ies'} - <b>{pkr(tDirect)}</b>. Shown separately so the same money is not counted twice.</p>
        ) : null}
        {rowsAll.some((r) => r.holder_role === 'sso' || r.kind === 'accounts') ? (
          <p className='muted' style={{ marginTop: 6 }}>For advances and receipts held by the Sr. SO, Spent includes cash passed on to Support Officers, and Returned includes cash returned to Accounts. They are applied oldest first because the Sr. SO does not pick an advance when spending.</p>
        ) : null}
      </div>
    </>
  );
}
