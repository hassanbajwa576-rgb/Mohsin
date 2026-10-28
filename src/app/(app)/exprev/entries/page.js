import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { todayKey, validDate } from '@/lib/att';
import { money, pkr } from '@/lib/exprev';
import { addEntry, deleteEntry } from '@/lib/exprev-actions';
import Flash from '@/components/Flash';
import Collapsible from '@/components/Collapsible';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
const SIZES = [25, 50, 100, 200];
const RANGES = [['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['lastyear', 'Last year'], ['all', 'All time']];
const iso = (d) => d.toISOString().slice(0, 10);

// From and to dates for a quick range.
function rangeDates(key, today, first) {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  if (key === 'lastmonth') return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
  if (key === 'year') return [y + '-01-01', today];
  if (key === 'lastyear') return [y - 1 + '-01-01', y - 1 + '-12-31'];
  if (key === 'all') return [first || '2000-01-01', today];
  return [today.slice(0, 8) + '01', today];
}

export default async function ExpRevEntries({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const today = todayKey();
  const bounds = (await q('SELECT MIN(spent_on)::text AS first FROM pc2_er_entries'))[0];
  const range = RANGES.some(([k]) => k === sp.range) ? sp.range : '';
  const custom = !range && validDate(sp.from || '') && validDate(sp.to || '');
  const [rf, rt] = rangeDates(range || 'month', today, bounds && bounds.first);
  let from = custom ? sp.from : rf;
  const to = custom ? sp.to : rt;
  if (from > to) from = to;
  const size = SIZES.includes(Number(sp.size)) ? Number(sp.size) : 50;
  const cc = String(sp.cc || '');
  const text = String(sp.q || '').trim();
  const off = sp.of === 'ISB' || sp.of === 'LHR' ? sp.of : '';
  const where = ['spent_on >= $1', 'spent_on <= $2'];
  const args = [from, to];
  if (cc) {
    args.push(cc);
    where.push('cost_center = $' + args.length);
  }
  if (off) {
    args.push(off);
    where.push("(CASE WHEN upper(trim(office)) = 'ISB' THEN 'ISB' ELSE 'LHR' END) = $" + args.length);
  }
  if (text) {
    args.push('%' + text + '%');
    where.push('(detail ILIKE $' + args.length + ' OR vendor ILIKE $' + args.length + ' OR expense_type ILIKE $' + args.length + ' OR remarks ILIKE $' + args.length + ')');
  }
  const W = where.join(' AND ');
  const count = (await q('SELECT COUNT(*)::int AS n FROM pc2_er_entries WHERE ' + W, args))[0].n;
  const pages = Math.max(1, Math.ceil(count / size));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const offset = (page - 1) * size;
  const [rows, sum, lists] = await Promise.all([
    q('SELECT id, spent_on::text AS d, cost_center, expense_type, detail, amount::float8 AS amount, pay_mode, office, vendor, remarks FROM pc2_er_entries WHERE ' + W + ' ORDER BY spent_on DESC, id DESC LIMIT ' + size + ' OFFSET ' + offset, args),
    q('SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::float8 AS total FROM pc2_er_entries WHERE ' + W, args),
    q("SELECT 'cc' AS k, cost_center AS v FROM pc2_er_entries GROUP BY 2 UNION ALL SELECT 'et', expense_type FROM pc2_er_entries GROUP BY 2 UNION ALL SELECT 'pm', pay_mode FROM pc2_er_entries GROUP BY 2 UNION ALL SELECT 'of', office FROM pc2_er_entries GROUP BY 2 ORDER BY 1, 2"),
  ]);
  const of = (k) => lists.filter((x) => x.k === k && x.v).map((x) => x.v);
  const ccs = of('cc');
  const keep = { ...(range ? { range } : custom ? { from, to } : {}), ...(cc ? { cc } : {}), ...(off ? { of: off } : {}), ...(text ? { q: text } : {}), size: String(size) };
  const link = (extra) => '/exprev/entries?' + new URLSearchParams({ ...keep, ...extra }).toString();
  const lo = count ? offset + 1 : 0;
  const hi = Math.min(count, offset + size);
  // Page numbers: the first, the last and a few around the current one.
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const pager = pages > 1 ? (
    <nav className='er-pager' aria-label='Pages'>
      {page > 1 ? <Link className='btn' href={link({ page: page - 1 })}>Previous</Link> : <span className='btn ghost off'>Previous</span>}
      {nums.map((p, i) => (
        <span key={p} className='er-pgs'>
          {i && p - nums[i - 1] > 1 ? <span className='muted'>...</span> : null}
          <Link className={'chip' + (p === page ? ' on' : '')} href={link({ page: p })} aria-current={p === page ? 'page' : undefined}>{p}</Link>
        </span>
      ))}
      {page < pages ? <Link className='btn' href={link({ page: page + 1 })}>Next</Link> : <span className='btn ghost off'>Next</span>}
    </nav>
  ) : null;

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

      <div className='inline er-months'>
        {RANGES.map(([k, l]) => <Link key={k} href={'/exprev/entries?range=' + k + '&size=' + size + (off ? '&of=' + off : '') + (cc ? '&cc=' + encodeURIComponent(cc) : '')} className={'chip' + ((range || (custom ? '' : 'month')) === k ? ' on' : '')}>{l}</Link>)}
      </div>

      <Collapsible title='Filters'>
      <form method='get' className='filters'>
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        <label>Cost center
          <select name='cc' defaultValue={cc}><option value=''>All</option>{ccs.map((v) => <option key={v} value={v}>{v}</option>)}</select>
        </label>
        <label>Office
          <select name='of' defaultValue={off} autoComplete='off'><option value=''>All</option><option value='LHR'>LHR (blank)</option><option value='ISB'>ISB</option></select>
        </label>
        <label>Search<input name='q' defaultValue={text} placeholder='Detail, vendor, remarks' /></label>
        <label>Per page
          <select name='size' defaultValue={size}>{SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/exprev/entries' className='btn ghost'>Reset</Link>
      </form>
      </Collapsible>

      <div className='kpis er-kpis'>
        <div className='card kpi'><span>Total of these entries</span><b>{pkr(sum[0].total)}</b><small className='m-only'>{sum[0].n.toLocaleString('en-US')} entries · page {page} of {pages}</small></div>
        <div className='card kpi alt er-kpi2'><span>Entries</span><b>{sum[0].n.toLocaleString('en-US')}</b><small>Showing {lo.toLocaleString('en-US')} to {hi.toLocaleString('en-US')} · page {page} of {pages}</small></div>
      </div>

      {pager}
      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx er-tx'>
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
                    <td className='c-meta'>{r.office || 'LHR'}</td>
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
      {pager}
    </>
  );
}
