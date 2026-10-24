import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, allOffices, todayKey, validDate, fmt12, fmtDay, fmtDur } from '@/lib/att';
import { addDay } from '@/lib/att-import';
import { VTYPES, VLABEL, visitorRows, pendingDeletes, noShows } from '@/lib/visitors';
import { deleteVisitor, decideVisitorDelete } from '@/lib/vis-actions';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

export default async function VisitorLogPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!can(user, 'vis_log')) redirect('/visitors');
  const sp = await searchParams;
  const today = todayKey();
  const to = validDate(sp.to || '') ? sp.to : today;
  let from = validDate(sp.from || '') ? sp.from : addDay(to, -6);
  if (from > to) from = to;
  const office = allOffices(user) ? (['LHR', 'ISB'].includes(sp.office) ? sp.office : '') : user.office_code;
  const vtype = VLABEL[sp.vtype] ? sp.vtype : '';
  const text = String(sp.q || '').trim().slice(0, 60);
  const rows = await visitorRows({ from, to, office, vtype, text });
  const pending = user.role === 'om' ? await pendingDeletes() : [];
  const missed = await noShows({ from, to, office });
  const done = rows.filter((v) => v.out_ms);
  const avg = done.length ? done.reduce((a, v) => a + (Number(v.out_ms) - Number(v.in_ms)), 0) / done.length : 0;
  const qs = new URLSearchParams({ from, to, ...(office ? { office } : {}), ...(vtype ? { vtype } : {}), ...(text ? { q: text } : {}) }).toString();
  const quick = (label, f, t) => <Link className={'chip' + (from === f && to === t ? ' on' : '')} href={'/visitors/log?' + new URLSearchParams({ from: f, to: t, ...(office ? { office } : {}), ...(vtype ? { vtype } : {}), ...(text ? { q: text } : {}) }).toString()}>{label}</Link>;

  return (
    <>
      <div className='head'>
        <div>
          <h1>Visitor Log</h1>
          <p className='muted'>Everyone who visited, who they met, and how long they stayed.</p>
        </div>
        <div className='inline'>
          <a href={'/visitors/log/xlsx?' + qs} className='btn primary'>Download Excel (.xlsx)</a>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='chips' style={{ marginBottom: 10 }}>
        {quick('Today', today, today)}
        {quick('7 days', addDay(today, -6), today)}
        {quick('30 days', addDay(today, -29), today)}
        {quick('This month', today.slice(0, 8) + '01', today)}
      </div>
      <form method='get' className='card filters'>
        <label>From<input type='date' name='from' defaultValue={from} /></label>
        <label>To<input type='date' name='to' defaultValue={to} /></label>
        {allOffices(user) ? (
          <label>Office
            <select name='office' defaultValue={office}><option value=''>Both</option><option>LHR</option><option>ISB</option></select>
          </label>
        ) : null}
        <label>Type
          <select name='vtype' defaultValue={vtype}><option value=''>All types</option>{VTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>Search<input name='q' defaultValue={text} placeholder='Name, company, phone or who they met' /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/visitors/log' className='btn ghost'>Reset</Link>
      </form>

      {pending.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Delete requests ({pending.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Visitor</th><th>Requested by</th><th>Reason</th><th></th></tr></thead>
              <tbody>
                {pending.map((v) => (
                  <tr key={v.id}>
                    <td className='c-title'><b>{v.name}</b><div className='muted'>{fmtDay(v.in_ms)}, {fmt12(v.in_ms)}</div></td>
                    <td className='c-meta'>{v.req_name}</td>
                    <td className='c-meta'>{v.del_reason}</td>
                    <td className='act'>
                      <form action={decideVisitorDelete} className='inline'>
                        <input type='hidden' name='id' value={v.id} />
                        <button name='decision' value='approve' className='btn bad' type='submit'>Approve delete</button>
                        <button name='decision' value='keep' className='btn' type='submit'>Keep record</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className='kpis'>
        <div className='card kpi'><span>Visitors</span><b>{rows.length}</b></div>
        <div className='card kpi alt'><span>Still inside</span><b>{rows.length - done.length}</b></div>
        <div className='card kpi alt'><span>Average stay</span><b>{done.length ? fmtDur(avg) : '-'}</b></div>
        <div className='card kpi alt'><span>No shows</span><b>{missed.length}</b></div>
      </div>

      <div className='card'>
        {rows.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Date</th><th>Visitor</th><th>Type</th><th>Met</th><th>In</th><th>Out</th><th>Time spent</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td className='nw c-meta'>{fmtDay(v.in_ms)}</td>
                    <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b>{v.del_req_by ? <div className='over-t'>Delete requested by {v.req_name}</div> : null}{v.company ? <div className='muted'>{v.company}</div> : null}{v.phone ? <div className='muted'>{v.phone}</div> : null}</td>
                    <td className='c-meta'>{VLABEL[v.vtype]}</td>
                    <td className='c-meta'>{v.host || '-'}</td>
                    <td className='nw c-meta'>{fmt12(v.in_ms)}</td>
                    <td className='nw c-meta'>{v.out_ms ? fmt12(v.out_ms) : <span className='muted'>inside</span>}</td>
                    <td className='nw c-meta'>{v.out_ms ? fmtDur(Number(v.out_ms) - Number(v.in_ms)) : '-'}</td>
                    <td className='c-meta'>{v.purpose || ''}{v.badge ? <div className='muted'>Badge {v.badge}</div> : null}</td>
                    <td className='act'>
                      <Link className='btn' href={'/visitors/edit?id=' + v.id}>Edit</Link>
                      {user.role === 'om' ? (
                        <form action={deleteVisitor} className='inline'>
                          <input type='hidden' name='id' value={v.id} />
                          <ConfirmButton className='btn ghost' message='Delete this visitor record?'>Delete</ConfirmButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>No visitors for these filters.</p>}
      </div>

      {missed.length ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>No shows ({missed.length})</h3>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Expected</th><th>Visitor</th><th>Type</th><th>Meeting with</th><th>Added by</th><th>Marked by</th></tr></thead>
              <tbody>
                {missed.map((v) => (
                  <tr key={v.id}>
                    <td className='nw c-meta'>{fmtDay(v.due_ms)}, {fmt12(v.due_ms)}</td>
                    <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b>{v.company ? <div className='muted'>{v.company}</div> : null}{v.phone ? <div className='muted'>{v.phone}</div> : null}</td>
                    <td className='c-meta'>{VLABEL[v.vtype]}</td>
                    <td className='c-meta'>{v.host || '-'}</td>
                    <td className='c-meta'>{v.by_name || '-'}</td>
                    <td className='c-meta'>{v.marked_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}