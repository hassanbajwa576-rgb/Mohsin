import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ATT_ROLES, allOffices, todayKey, fmtTime, fmt12, fmtDay, fmtDur, dateKey } from '@/lib/att';
import { VTYPES, VLABEL, insideNow, visitorRows, hostNames, canEditVisitor, waitingQueue, laterQueue } from '@/lib/visitors';
import { addVisitor, checkOutVisitor, addExpected, markArrived, markNoShow, cancelExpected } from '@/lib/vis-actions';
import Flash from '@/components/Flash';
import OfficeTag from '@/components/OfficeTag';

export const dynamic = 'force-dynamic';

// Check visitors in and out. Everyone who uses the app can do this for their own office.
export default async function VisitorsPage({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  const sp = await searchParams;
  const both = allOffices(user);
  const office = both ? '' : user.office_code;
  const now = Date.now();
  const today = todayKey();
  const nowTime = fmtTime(now);
  const inside = await insideNow(office);
  const seen = (await visitorRows({ from: today, to: today, office })).filter((v) => v.out_ms);
  const names = await hostNames(office);
  const queue = await waitingQueue(office, today);
  const later = await laterQueue(office, today);
  const planner = user.role !== 'guard';
  const when = (ms) => (dateKey(ms) === today ? '' : fmtDay(ms) + ', ') + fmt12(ms);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Visitor Entry</h1>
          <p className='muted'>Record who comes to the office, who they meet, and when they leave.</p>
        </div>
      </div>
      <Flash sp={sp} />

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Expected visitors ({queue.length})</h3>
        <p className='muted' style={{ marginTop: 0 }}>{planner ? 'Add a visitor here before they come. The guard marks them as arrived or no show.' : 'When a visitor arrives, tap Arrived. If they do not come, tap No show.'}</p>
        {queue.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Visitor</th><th>Type</th><th>Meeting with</th><th>Expected</th><th>Added by</th><th></th></tr></thead>
              <tbody>
                {queue.map((v) => (
                  <tr key={v.id}>
                    <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b>{v.company ? <div className='muted'>{v.company}</div> : null}{v.phone ? <div className='muted'>{v.phone}</div> : null}{v.purpose ? <div className='muted'>{v.purpose}</div> : null}</td>
                    <td className='c-meta'>{VLABEL[v.vtype]}</td>
                    <td className='c-meta'>{v.host || '-'}</td>
                    <td className='nw c-meta'>{when(v.due_ms)}</td>
                    <td className='c-meta'>{v.by_name || '-'}</td>
                    <td className='act'>
                      <form action={markArrived} className='inline'>
                        <input type='hidden' name='id' value={v.id} />
                        <input type='hidden' name='date' value={today} />
                        <input type='time' name='time' defaultValue={nowTime} required className='sm' />
                        <button className='btn primary' type='submit'>Arrived</button>
                      </form>
                      <form action={markNoShow} className='inline'>
                        <input type='hidden' name='id' value={v.id} />
                        <button className='btn' type='submit'>No show</button>
                      </form>
                      {planner ? (
                        <form action={cancelExpected} className='inline'>
                          <input type='hidden' name='id' value={v.id} />
                          <button className='btn ghost' type='submit'>Remove</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>Nobody is expected right now.</p>}
        {later.length ? (
          <>
            <h4 style={{ marginBottom: 6 }}>Coming on later days ({later.length})</h4>
            <div className='tablewrap'>
              <table className='tx'>
                <thead><tr><th>Visitor</th><th>Type</th><th>Meeting with</th><th>Expected</th><th></th></tr></thead>
                <tbody>
                  {later.map((v) => (
                    <tr key={v.id}>
                      <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b>{v.company ? <div className='muted'>{v.company}</div> : null}</td>
                      <td className='c-meta'>{VLABEL[v.vtype]}</td>
                      <td className='c-meta'>{v.host || '-'}</td>
                      <td className='nw c-meta'>{fmtDay(v.due_ms)}, {fmt12(v.due_ms)}</td>
                      <td className='act'>
                        {planner ? (
                          <form action={cancelExpected} className='inline'>
                            <input type='hidden' name='id' value={v.id} />
                            <button className='btn ghost' type='submit'>Remove</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      {planner ? (
        <div className='card'>
          <h3 style={{ marginTop: 0 }}>Add expected visitor</h3>
          <form action={addExpected} className='form'>
            <label>Name<input name='name' required maxLength={80} placeholder='Visitor name' autoComplete='off' /></label>
            <label>Phone<input name='phone' type='tel' maxLength={30} placeholder='03xx xxxxxxx' autoComplete='off' /></label>
            <label>Type of visit
              <select name='vtype' required defaultValue='candidate'>{VTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label>Company / bank<input name='company' maxLength={80} placeholder='Organisation (optional)' autoComplete='off' /></label>
            <label>Meeting with
              <input name='host' maxLength={80} list='vis-hosts' placeholder='Type a name' autoComplete='off' />
            </label>
            {both ? (
              <label>Office
                <select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select>
              </label>
            ) : null}
            <label>Date<input type='date' name='date' defaultValue={today} required /></label>
            <label>Expected time<input type='time' name='time' defaultValue={nowTime} required /></label>
            <label className='wide'>Purpose / notes<input name='purpose' maxLength={200} placeholder='For example: interview for the Marketing role' autoComplete='off' /></label>
            <button className='btn primary' type='submit'>Add to queue</button>
          </form>
        </div>
      ) : null}

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Walk-in visitor</h3>
        <p className='muted' style={{ marginTop: 0 }}>For someone who comes without being announced.</p>
        <form action={addVisitor} className='form'>
          <label>Name<input name='name' required maxLength={80} placeholder='Visitor name' autoComplete='off' /></label>
          <label>Phone<input name='phone' type='tel' maxLength={30} placeholder='03xx xxxxxxx' autoComplete='off' /></label>
          <label>Type of visit
            <select name='vtype' required defaultValue='candidate'>{VTYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label>Company / bank
            <input name='company' maxLength={80} placeholder='Organisation (optional)' autoComplete='off' />
          </label>
          <label>Meeting with
            <input name='host' maxLength={80} list='vis-hosts' placeholder='Type a name' autoComplete='off' />
            <datalist id='vis-hosts'>{names.map((n) => <option key={n} value={n} />)}</datalist>
          </label>
          <label>Badge / card no.<input name='badge' maxLength={20} placeholder='Optional' autoComplete='off' /></label>
          {both ? (
            <label>Office
              <select name='office' defaultValue={user.office_code}><option>LHR</option><option>ISB</option></select>
            </label>
          ) : null}
          <label>Date in<input type='date' name='date' defaultValue={today} required /></label>
          <label>Time in<input type='time' name='time' defaultValue={nowTime} required /></label>
          <label className='wide'>Purpose / notes<input name='purpose' maxLength={200} placeholder='For example: interview for the Marketing role' autoComplete='off' /></label>
          <button className='btn primary' type='submit'>Record visitor in</button>
        </form>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Inside now ({inside.length})</h3>
        {inside.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Visitor</th><th>Type</th><th>Meeting with</th><th>Since</th><th>So far</th><th></th></tr></thead>
              <tbody>
                {inside.map((v) => (
                  <tr key={v.id}>
                    <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b>{v.company ? <div className='muted'>{v.company}</div> : null}</td>
                    <td className='c-meta'>{VLABEL[v.vtype]}</td>
                    <td className='c-meta'>{v.host || '-'}</td>
                    <td className='nw c-meta'>{(dateKey(v.in_ms) === today ? '' : fmtDay(v.in_ms) + ', ') + fmt12(v.in_ms)}</td>
                    <td className='nw c-meta'>{fmtDur(now - Number(v.in_ms))}</td>
                    <td className='act'>
                      {canEditVisitor(user, v) ? <Link className='btn ghost' href={'/visitors/edit?id=' + v.id}>Edit</Link> : null}
                      <form action={checkOutVisitor} className='inline'>
                        <input type='hidden' name='id' value={v.id} />
                        <input type='hidden' name='date' value={today} />
                        <input type='time' name='time' defaultValue={nowTime} required className='sm' />
                        <button className='btn primary' type='submit'>Check out</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>Nobody is inside right now.</p>}
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Left today ({seen.length})</h3>
        {seen.length ? (
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th>Visitor</th><th>Type</th><th>Meeting with</th><th>In</th><th>Out</th><th>Time spent</th><th></th></tr></thead>
              <tbody>
                {seen.slice(0, 30).map((v) => (
                  <tr key={v.id}>
                    <td className='c-title'><OfficeTag o={v.office} /><b>{v.name}</b>{v.company ? <div className='muted'>{v.company}</div> : null}</td>
                    <td className='c-meta'>{VLABEL[v.vtype]}</td>
                    <td className='c-meta'>{v.host || '-'}</td>
                    <td className='nw c-meta'>{fmt12(v.in_ms)}</td>
                    <td className='nw c-meta'>{fmt12(v.out_ms)}</td>
                    <td className='nw c-meta'>{fmtDur(Number(v.out_ms) - Number(v.in_ms))}</td>
                    <td className='act'>{canEditVisitor(user, v) ? <Link className='btn ghost' href={'/visitors/edit?id=' + v.id}>Edit</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className='muted'>Nobody has left yet today.</p>}
        <p className='totals'><Link href='/visitors/log'>See the full visitor log</Link></p>
      </div>
    </>
  );
}