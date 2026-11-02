import { pkr } from '@/lib/fmt';

// Net position per fund: what is still open after everything settled with Accounts.
const n0 = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

// Role names go under the fund (gold); the amounts go under each figure (black) on the same lines.
const ROLE_NAMES = ['Sr. OM', 'Sr. SO', 'SO'];
// Cash in hand turns red once a holder is below 20% of the cash issued to them (cap = what each holder was given).
const LOW = 'var(--bad, #b3261e)';
// Red figure with a very light red wash behind it, so a low balance stands out.
const LOWBOX = { color: LOW, background: '#fbd3d3', padding: '1px 7px', borderRadius: 3, display: 'inline-block' };
const low = (v, cap, i) => !!cap && Number(cap[i]) > 0 && Number(v[i]) < 0.2 * Number(cap[i]);
// 20% or more of what was issued: green.
const GOOD = '#1b6e34';
const GOODWASH = '#d9f1df';
const okc = (v, cap, i) => !!cap && Number(cap[i]) > 0 && Number(v[i]) >= 0.2 * Number(cap[i]);
const GOODBOX = { color: GOOD, background: GOODWASH, padding: '1px 7px', borderRadius: 3, display: 'inline-block' };
function Lines({ values, roles, gold, cap, names }) {
  if (!roles.length) return null;
  return (
    <div style={{ fontSize: 11.5, fontWeight: 400, lineHeight: 1.6 }}>
      {roles.map((i) => (
        <div key={i} style={gold ? { color: 'var(--gold-d)', fontWeight: 600 } : low(values, cap, i) ? { color: LOW, fontWeight: 600 } : !gold && okc(values, cap, i) ? { color: GOOD, fontWeight: 600 } : { color: 'var(--gold-d)', fontWeight: 500 }}>
          {!gold && low(values, cap, i) ? <span style={{ background: '#fbd3d3', padding: '0 6px', borderRadius: 3 }}>{n0(values[i])}</span> : !gold && okc(values, cap, i) ? <span style={{ background: GOODWASH, padding: '0 6px', borderRadius: 3 }}>{n0(values[i])}</span> : gold ? names[i] : n0(values[i])}
        </div>
      ))}
    </div>
  );
}

export default function AdjustedPosition({ rows, waiting }) {
  const w = (k, g, role) => waiting.filter((x) => x.fund === k && x.grp === g && x.by_role === role).reduce((a, x) => a + Number(x.v), 0);
  // Holders: Sr. OM, Sr. SO, SO, then each advance-only team member (someone with no app account) on a line of their own.
  const hasPay = rows.some((f) => (f.payees || []).length);
  const roleKeys = ['om', 'sso', 'so', ...(hasPay ? ['payee'] : [])];
  const names = [...ROLE_NAMES, ...(hasPay ? ['BD-I'] : [])];
  const idx = roleKeys.map((_, i) => i);
  const payOf = (f, k) => (f.payees || []).reduce((a, p) => a + Number(p[k]), 0);
  const who = (k, g) => roleKeys.map((role) => w(k, g, role));
  const data = rows.map((f) => {
    const r = {
      key: f.key,
      label: f.label,
      cash: f.remaining,
      net: f.outstanding,
      cashWho: [f.pool, f.ssoCash, f.soCash, ...(hasPay ? [payOf(f, 'cash')] : [])],
      capWho: [...f.capWho, ...(hasPay ? [payOf(f, 'cap')] : [])],
      drafts: 0, draftsWho: who(f.key, 'draft'),
      review: 0, reviewWho: who(f.key, 'review'),
      ready: 0, readyWho: who(f.key, 'ready'),
    };
    // Not yet submitted by the Support Officer and awaiting approval are shown together.
    r.draftsWho = r.draftsWho.map((v, i) => v + r.reviewWho[i]);
    r.drafts = r.draftsWho.reduce((a, b) => a + b, 0);
    r.review = r.reviewWho.reduce((a, b) => a + b, 0);
    r.ready = r.readyWho.reduce((a, b) => a + b, 0);
    // Each person's own open total: cash they hold + their expenses waiting for adjustment.
    r.totWho = idx.map((i) => Number(r.cashWho[i]) + r.draftsWho[i] + r.readyWho[i]);
    return r;
  });
  const rolesOf = (r) => idx.filter((i) => [r.cashWho, r.draftsWho, r.readyWho].some((arr) => Number(arr[i]) > 0));
  const sumArr = (k) => idx.map((i) => data.reduce((a, r) => a + Number(r[k][i]), 0));
  const total = {
    cash: data.reduce((a, r) => a + r.cash, 0),
    drafts: data.reduce((a, r) => a + r.drafts, 0),
    review: data.reduce((a, r) => a + r.review, 0),
    ready: data.reduce((a, r) => a + r.ready, 0),
    net: data.reduce((a, r) => a + r.net, 0),
    cashWho: sumArr('cashWho'), capWho: idx.map((i) => data.reduce((a, r) => a + (Number(r.cashWho[i]) > 0 ? Number(r.capWho[i]) : 0), 0)), draftsWho: sumArr('draftsWho'), reviewWho: sumArr('reviewWho'), readyWho: sumArr('readyWho'), totWho: sumArr('totWho'),
  };
  const Row = ({ r, bold, label }) => {
    const roles = rolesOf(r);
    const st = bold ? { fontWeight: 700 } : undefined;
    return (
      <tr>
        <td>{bold ? <b>{label}</b> : <b>{r.label}</b>}<Lines roles={roles} gold values={[]} names={names} /></td>
        <td className='r nw' style={st}><span className='fig'>{pkr(r.ready)}</span><Lines roles={roles} values={r.readyWho} /></td>
        <td className='r nw' style={st}><span className='fig'>{pkr(r.drafts)}</span><Lines roles={roles} values={r.draftsWho} /></td>
        <td className='r nw' style={st}><span className='fig'>{pkr(r.cash)}</span><Lines roles={roles} values={r.cashWho} cap={r.capWho} /></td>
        <td className='r nw'><b>{pkr(r.net)}</b><Lines roles={roles} values={r.totWho} /></td>
      </tr>
    );
  };
  // Phones: one card per fund with four tiles instead of a wide table; funds with nothing open collapse into one line.
  const isZero = (r) => !Number(r.ready) && !Number(r.drafts) && !Number(r.cash) && !Number(r.net);
  const openFunds = data.filter((r) => !isZero(r));
  const emptyFunds = data.filter(isZero);
  const Tile = ({ label, amt, who, roles, gold, cap }) => (
    <div className={'adjtile' + (gold ? ' gold' : '')}>
      <small>{label}</small>
      <b>{pkr(amt)}</b>
      {roles.map((i) => <i key={i} style={cap && low(who, cap, i) ? { color: LOW } : cap && okc(who, cap, i) ? { color: GOOD } : undefined}>{names[i]} {cap && low(who, cap, i) ? <span style={{ background: '#fbd3d3', padding: '0 6px', borderRadius: 3 }}>{n0(who[i])}</span> : cap && okc(who, cap, i) ? <span style={{ background: GOODWASH, padding: '0 6px', borderRadius: 3 }}>{n0(who[i])}</span> : n0(who[i])}</i>)}
    </div>
  );
  const FundCard = ({ r, title, tot }) => {
    const roles = rolesOf(r);
    return (
      <div className={'adjcard' + (tot ? ' tot' : '')}>
        <h4>{title || r.label}</h4>
        <div className='adjgrid'>
          <Tile label='Ready for Accounts' amt={r.ready} who={r.readyWho} roles={roles} />
          <Tile label='Not yet approved' amt={r.drafts} who={r.draftsWho} roles={roles} />
          <Tile label='Cash in hand' amt={r.cash} who={r.cashWho} roles={roles} cap={r.capWho} />
          <Tile label='Advances Outstanding' amt={r.net} who={r.totWho} roles={roles} gold />
        </div>
      </div>
    );
  };
  return (
    <div className='card'>
      <h3>Adjusted Position</h3>
      <div className='adjcards'>
        {openFunds.map((r) => <FundCard key={r.key} r={r} />)}
        {emptyFunds.length ? <div className='adjnote'>{emptyFunds.map((r) => r.label).join(', ')}: nothing open (all PKR 0)</div> : null}
        <FundCard r={total} title='Total' tot />
      </div>
      <div className='tablewrap adj-desk'>
        <table className='adjpos'>
          <thead>
            <tr><th>Fund</th><th className='r'>Ready for Accounts</th><th className='r'>Not yet approved</th><th className='r'>Cash in hand</th><th className='r'>Advances Outstanding</th></tr>
          </thead>
          <tbody>
            {data.map((r) => <Row key={r.key} r={r} />)}
          </tbody>
          <tfoot>
            <Row r={total} bold label='Total' />
          </tfoot>
        </table>
      </div>
      <p className='muted' style={{ marginTop: 8 }}>Advances Outstanding = Ready for Accounts + Not yet approved + Cash in hand. The gold names under a fund are who holds the cash and who made the expenses; the amounts under each figure follow the same order. Anything already adjusted is not shown.</p>
    </div>
  );
}

