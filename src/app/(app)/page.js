import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { expWhere, fundSummary, issueRows, soAccount, fundOfficeSpend, waitingByFund, EXP_FROM, EXP_COLS } from '@/lib/queries';
import FundMatrix, { buildMatrix } from '@/components/FundMatrix';
import { pkr, STATUS_LABEL, FUNDS } from '@/lib/fmt';
import ExpenseTable from '@/components/ExpenseTable';
import FundCard from '@/components/FundCard';
import CashSplit from '@/components/CashSplit';
import OfficeTag, { OfficeSplit } from '@/components/OfficeTag';
import Flash from '@/components/Flash';
import { submitDrafts } from '@/lib/actions';

const PIPE = ['draft', 'submitted', 'approved', 'sent'];

function Bars({ rows }) {
  if (!rows.length) return <p className='muted'>Nothing recorded yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className='bars'>
      {rows.map((r) => (
        <div className='bar' key={r.label}>
          <div className='bar-top'><span>{r.label}</span><b>{pkr(r.value)}</b></div>
          <div className='track'><div className='fill' style={{ width: (r.value / max) * 100 + '%' }} /></div>
        </div>
      ))}
    </div>
  );
}

const num = (rows) => rows.map((r) => ({ label: r.label, value: Number(r.value) }));
const byStatus = (rows) => Object.fromEntries(rows.map((r) => [r.status, { c: Number(r.c), v: Number(r.v) }]));

function Pipeline({ pipe, hot }) {
  return (
    <div className='pipe'>
      {PIPE.map((st, i) => {
        const p = pipe[st] || { c: 0, v: 0 };
        return (
          <Link key={st} href={'/expenses?status=' + st} className={'card step' + (hot.includes(st) && p.c > 0 ? ' now' : '')}>
            <div className='n'>{i + 1}</div>
            <div className='t'>{STATUS_LABEL[st]}</div>
            <div className='c'>{p.c}</div>
            <div className='s'>{pkr(p.v)}</div>
          </Link>
        );
      })}
    </div>
  );
}

// Net position per fund: what is still open after everything settled with Accounts.
function AdjustedPosition({ rows, waiting }) {
  const w = (k, g) => Number((waiting.find((x) => x.fund === k && x.grp === g) || {}).v || 0);
  const data = rows.map((f) => ({ key: f.key, label: f.label, cash: f.remaining, drafts: w(f.key, 'draft'), review: w(f.key, 'review'), ready: w(f.key, 'ready'), net: f.outstanding }));
  const tot = (k) => data.reduce((a, r) => a + r[k], 0);
  return (
    <div className='card'>
      <h3>Adjusted position</h3>
      <div className='tablewrap'>
        <table>
          <thead>
            <tr><th>Fund</th><th className='r'>Cash in hand</th><th className='r'>Not yet submitted</th><th className='r'>Awaiting approval</th><th className='r'>Ready for Accounts</th><th className='r'>Net position</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.key}>
                <td><b>{r.label}</b></td>
                <td className='r nw'>{pkr(r.cash)}</td>
                <td className='r nw'>{pkr(r.drafts)}</td>
                <td className='r nw'>{pkr(r.review)}</td>
                <td className='r nw'>{pkr(r.ready)}</td>
                <td className='r nw'><b>{pkr(r.net)}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              {['cash', 'drafts', 'review', 'ready', 'net'].map((k) => (
                <td key={k} className='r nw' style={{ fontWeight: 700 }}>{pkr(tot(k))}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className='muted' style={{ marginTop: 8 }}>Net position = cash in hand + expenses still waiting for adjustment with Accounts. Anything already adjusted is not shown.</p>
    </div>
  );
}

async function SoDashboard({ user, sp }) {
  const issues = await issueRows(user);
  const acct = await soAccount(user.id);
  const w = expWhere(user, {});
  const [pipeRows, recent] = await Promise.all([
    q(`SELECT e.status, COUNT(*)::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ${EXP_FROM} ${w.where} GROUP BY e.status`, w.params),
    q(`SELECT ${EXP_COLS} ${EXP_FROM} ${w.where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 10`, w.params),
  ]);
  const inHand = issues.reduce((a, i) => a + i.amount - i.returned - Number(i.spent), 0);
  const received = issues.reduce((a, i) => a + i.amount, 0);
  const spent = issues.reduce((a, i) => a + Number(i.spent), 0);
  return (
    <>
      <div className='head'>
        <div>
          <h1>My dashboard</h1>
          <p className='muted'>Advances issued to you, what you have spent and what is awaiting review</p>
        </div>
        <Link href='/expenses' className='btn primary'>Submit an expense</Link>
      </div>
      <Flash sp={sp} />
      <h2>Expense pipeline</h2>
      <Pipeline pipe={pipe} hot={todoStatuses} />

      {todo.length ? (
        <>
          <h2>{isOM ? 'Needs your review' : 'Waiting for your verification'}</h2>
          <div className='card'>
            <ExpenseTable rows={todo.slice(0, 5)} user={user} back='/' />
            {todo.length > 5 ? <p className='totals'>Showing 5 of {todo.length} - <Link href='/expenses?status=submitted'>View all on the Expenses page</Link></p> : null}
          </div>
        </>
      ) : null}

      <div className='card'>
        <h3>Funds</h3>
        <div className='tablewrap'>
          <table>
            <thead>
              <tr><th>Fund</th><th className='r'>Advances</th><th className='r'>Expenses</th><th className='r'>Submitted to Accounts</th><th className='r'>Returned to Accounts</th><th className='r'>Advances Outstanding</th><th className='r'>CIH</th></tr>
            </thead>
            <tbody>
              {usedFunds.map((f) => (
                <tr key={f.key}>
                  <td><b>{f.label}</b></td>
                  <td className='r nw'>{pkr(f.received)}</td>
                  <td className='r nw'>{pkr(f.spent)}</td>
                  <td className='r nw'>{pkr(f.sent)}</td>
                  <td className='r nw'>{pkr(f.returned)}</td>
                  <td className='r nw'>{pkr(f.outstanding)}</td>
                  <td className={'r nw' + (f.remaining < 0 ? ' neg-t' : '')}><b>{pkr(f.remaining)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total</b></td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.received)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.spent)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.sent)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.returned)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.outstanding)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {emptyFunds.length ? <p className='muted' style={{ marginTop: 8 }}>{emptyFunds.map((f) => f.label).join(', ')} - nothing recorded yet.</p> : null}
        <p className='muted' style={{ marginTop: 8 }}>Expenses by office: <OfficeTag o='LHR' /> {pkr(offLine('LHR'))} <OfficeTag o='ISB' /> {pkr(offLine('ISB'))}</p>
      </div>

      <div className='card'>
        <h3>Where the cash sits</h3>
        <div className='tablewrap'>
          <table>
            <thead>
              <tr><th>Fund</th><th className='r'>With Sr. Ops Manager</th><th className='r'>With Sr. SO</th><th className='r'>With SO</th><th className='r'>CIH</th></tr>
            </thead>
            <tbody>
              {usedFunds.map((f) => (
                <tr key={f.key}>
                  <td><b>{f.label}</b></td>
                  <td className='r nw'>{pkr(f.pool)}</td>
                  <td className='r nw'>{pkr(f.ssoCash)}</td>
                  <td className='r nw'>{pkr(f.soCash)}</td>
                  <td className='r nw'><b>{pkr(f.remaining)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total</b></td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.pool)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.ssoCash)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.soCash)}</td>
                <td className='r nw' style={{ fontWeight: 700 }}>{pkr(T.remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
