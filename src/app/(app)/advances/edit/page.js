import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { editAdvance, editIssue } from '@/lib/actions';
import { FUNDS, pkr } from '@/lib/fmt';
import Flash from '@/components/Flash';

export default async function EditAdvancePage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const id = Number.isInteger(Number(sp.id)) ? Number(sp.id) : 0;
  const received = sp.type !== 'issue';

  let row;
  let holders = [];
  if (received) {
    row = (await q(`SELECT id, fund, amount, reference, note, to_char(received_on, 'YYYY-MM-DD') AS received_on FROM pc2_advances WHERE id = $1`, [id]))[0];
  } else {
    row = (await q(
      `SELECT i.id, i.fund, i.amount, i.returned, i.note, i.issued_to, i.payee_id, to_char(i.issued_on, 'YYYY-MM-DD') AS issued_on, COALESCE(u.name, p.name) AS holder, COALESCE((SELECT SUM(e.amount) FROM pc2_expenses e WHERE e.issue_id = i.id AND e.status <> 'rejected'), 0)::float8 AS spent
       FROM pc2_issues i LEFT JOIN pc2_users u ON u.id = i.issued_to LEFT JOIN pc2_payees p ON p.id = i.payee_id WHERE i.id = $1`,
      [id]
    ))[0];
    if (row) {
      const [users, payees] = await Promise.all([
        q("SELECT u.id, u.name, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.role IN ('so', 'sso') AND (u.active OR u.id = $1) ORDER BY u.name", [row.issued_to || 0]),
        q('SELECT p.id, p.name, o.code AS office FROM pc2_payees p JOIN pc2_offices o ON o.id = p.office_id WHERE p.active OR p.id = $1 ORDER BY p.name', [row.payee_id || 0]),
      ]);
      holders = [
        { label: 'Team members (with a login)', items: users.map((x) => ({ key: 'u-' + x.id, text: x.name + ' (' + (x.role === 'sso' ? 'Sr. SO' : 'SO') + ', ' + x.office + ')' })) },
        { label: 'Advance-only team members (no login)', items: payees.map((x) => ({ key: 'p-' + x.id, text: x.name + ' (' + x.office + ')' })) },
      ];
    }
  }
  if (!row) redirect('/advances');

  return (
    <>
      <div className='head'>
        <div>
          <h1>{received ? 'Edit funds received #' + row.id : 'Edit advance #' + row.id}</h1>
          <p className='muted'>Every change is recorded in the Logs.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        {received ? (
          <form action={editAdvance} className='form'>
            <input type='hidden' name='id' value={row.id} />
            <label>Date received<input type='date' name='received_on' defaultValue={row.received_on} required /></label>
            <label>Fund
              <select name='fund' defaultValue={row.fund}>{Object.entries(FUNDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label>Amount (PKR)<input name='amount' type='number' min='1' step='1' inputMode='numeric' defaultValue={row.amount} required /></label>
            <label>Reference<input name='reference' defaultValue={row.reference} /></label>
            <label className='wide'>Note<input name='note' defaultValue={row.note} /></label>
            <button className='btn primary' type='submit'>Save changes</button>
            <Link href='/advances' className='btn ghost'>Cancel</Link>
          </form>
        ) : (
          <form action={editIssue} className='form'>
            <input type='hidden' name='id' value={row.id} />
            <label>Issued to
              <select name='holder' defaultValue={row.issued_to ? 'u-' + row.issued_to : 'p-' + row.payee_id}>
                {holders.filter((g) => g.items.length).map((g) => (
                  <optgroup key={g.label} label={g.label}>{g.items.map((x) => <option key={x.key} value={x.key}>{x.text}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label>Fund<input value={FUNDS[row.fund]} disabled readOnly /></label>
            <label>Amount (PKR)<input name='amount' type='number' min={row.returned + Number(row.spent)} step='1' inputMode='numeric' defaultValue={row.amount} required /></label>
            <label>Date issued<input type='date' name='issued_on' defaultValue={row.issued_on} required /></label>
            <label className='wide'>Note<input name='note' defaultValue={row.note} /></label>
            <p className='muted wide'>To move this advance to someone else, change Issued to. Its expenses move with it.</p>
            <p className='muted wide'>Already spent {pkr(row.spent)} and returned {pkr(row.returned)} - the amount cannot go below {pkr(row.returned + Number(row.spent))}.</p>
            <button className='btn primary' type='submit'>Save changes</button>
            <Link href='/advances' className='btn ghost'>Cancel</Link>
          </form>
        )}
      </div>
    </>
  );
}
