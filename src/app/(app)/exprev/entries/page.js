import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { todayKey, validDate } from '@/lib/att';
import { money, pkr } from '@/lib/exprev';
import { addEntry, deleteEntry } from '@/lib/exprev-actions';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
const LIMIT = 300;

export default async function ExpRevEntries({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  let from = validDate(sp.from || '') ? sp.from : to.slice(0, 8) + '01';
  if (from > to) from = to;
  const cc = String(sp.cc || '');
  const text = String(sp.q || '').trim();
  const where = ['spent_on >= $1', 'spent_on <= $2'];
  const args = [from, to];
  if (cc) {
    args.push(cc);
    where.push('cost_center = $' + args.length);
  }
  if (text) {
    args.push('%' + text + '%');
    where.push('(detail ILIKE $' + args.length + ' OR vendor ILIKE $' + args.length + ' OR expense_type ILIKE $' + args.length + ' OR remarks ILIKE $' + args.length + ')');
  }
  const W = where.join(' AND ');
  const [rows, sum, lists] = await Promise.all([
    q('SELECT id, spent_on::text AS d, cost_center, expense_type, detail, amount::float8 AS amount, pay_mode, office, vendor, remarks FROM pc2_er_entries WHERE ' + W + ' ORDER BY spent_on DESC, id DESC LIMIT ' + LIMIT, args),
    q('SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float8 AS total FROM pc2_er_entries WHERE ' + W, args),
    q("SELECT 'cc' AS k, cost_center AS v FROM pc2_er_entries GROUP BY 2 UNION ALL SELECT 'et', expense_type FROM pc2_er_entries GROUP BY 2 UNION ALL SELECT 'pm', pay_mode FROM pc2_er_entries GROUP BY 2 UNION ALL SELECT 'of', office FROM pc2_er_entries GROUP BY 2 ORDER BY 1, 2"),
  ]);
  const of = (k) => lists.filter((x) => x.k === k && x.v).map((x) => x.v);
  const ccs = of('cc');

  return (
    <>
      <div className='head'>
        <div>
          <h1>Expenditures</h1>
          <p className='muted'>Every expenditure entry, with its cost center, expense type, vendor and remarks.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <details className='card'>
        <summary><b>Add an entry</b></summary>
        <form action={addEntry} className='er-form'>
          <label>Date<input type='date' name='date' defaultValue={today} required /></label>
          <label>Cost center<input name='cc' list='er-cc' required placeholder='Office Supplies - 6200' /></label>
          <label>Expense type<input name='type' list='er-et' placeholder='General & Cleaning Supplies - 6202' /></label>
          <label>Amount (PKR)<input name='amount' inputMode='decimal' required placeholder='0' /></label>
          <label className='wide'>Detail<input name='detail' placeholder='What it was for' /></label>
          <label>Payment mode<input name='mode' list='er-pm' /></label>
          <label>Office<input name='office' list='er-of' /></label>
          <label>Vendor / user<input name='vendor' /></label>
          <label className='wide'>Remarks<input name='remarks' /></label>
          <button className='btn primary' type='submit'>Add entry</button>
        </form>
        <datalist id='er-cc'>{ccs.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id='er-et'>{of('et').map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id='er-pm'>{of('pm').map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id='er-of'>{of('of').map((v) => <option key={v} value={v} />)}</datalist>
      </details>

      <form method='get' className='card filters'>
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        <label>Cost center
          <select name='cc' defaultValue={cc}><option value=''>All</option>{ccs.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        </label>
        <label>Search<input name='q' defaultValue={text} placeholder='Detail, vendor, remarks' /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/exprev/entries' className='btn ghost'>Reset</Link>
      </form>

      <div className='kpis'>
        <div className='card kpi'><span>Total of these entries</span><b>{pkr(sum[0].total)}</b></div>
        <div className='card kpi alt'><span>Entries</span><b>{sum[0].n.toLocaleString('en-US')}</b>{sum[0].n > LIMIT ? <small>Showing the latest {LIMIT}. Narrow the dates to see the rest.</small> : null}</div>
      </div>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Date</th><th>Cost center</th><th>Expense type</th><th>Detail</th><th className='r'>Amount</th><th>Paid by</th><th>Office</th><th>Vendor / user</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className='nw c-meta'>{r.d}</td>
                    <td className='c-title'>{r.cost_center}</td>
                    <td className='c-meta'>{r.expense_type}</td>
                    <td className='c-meta'>{r.detail}{r.remarks ? <div className='muted'>{r.remarks}</div> : null}</td>
                    <td className='r nw c-meta'><b>{money(r.amount)}</b></td>
                    <td className='c-meta'>{r.pay_mode}</td>
                    <td className='c-meta'>{r.office}</td>
                    <td className='c-meta'>{r.vendor}</td>
                    <td className='act'>
                      <form action={deleteEntry} className='inline'>
                        <input type='hidden' name='id' value={r.id} />
                        <ConfirmButton className='btn ghost' message='Remove this entry?'>Remove</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No entries for these filters.</p>}
      </div>
    </>
  );
}
