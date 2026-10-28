import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { SUPPORT_ROLES, fmtDay, fmt12 } from '@/lib/att';
import { hkPeople } from '@/lib/roster';
import { CATS, PRIOS, CLABEL, PLABEL, WLABEL, canSee, complaintById, filesOf, notesOf, assignees, isMgr, refOf, remindOverdue } from '@/lib/support';
import { addNote, assignComplaint, tagResponsible, updateComplaint, resolveComplaint, reopenComplaint } from '@/lib/support-actions';
import OfficeTag from '@/components/OfficeTag';
import Flash from '@/components/Flash';

export const dynamic = 'force-dynamic';

// One complaint: the facts, the pictures, the timeline, and what the person handling it can do.
export default async function ComplaintViewPage({ searchParams }) {
  const user = await requireUser(SUPPORT_ROLES);
  const sp = await searchParams;
  const c = await complaintById(sp.id);
  if (!c) redirect('/support/list?err=' + encodeURIComponent('That complaint no longer exists'));
  if (!canSee(user, c)) redirect('/support?err=' + encodeURIComponent('You cannot open that complaint'));
  await remindOverdue();
  const mgr = isMgr(user);
  const mineToHandle = mgr || c.assigned_to === user.id;
  const [files, notes, people, team] = await Promise.all([filesOf(c.id), notesOf(c.id), mgr ? assignees() : [], mgr ? hkPeople({}) : []]);
  const pics = files.filter((f) => f.mime.startsWith('image/'));
  const docs = files.filter((f) => !f.mime.startsWith('image/'));

  return (
    <>
      <div className='head'>
        <div>
          <h1>{refOf(c.id)} {c.title}</h1>
          <p className='muted'><OfficeTag o={c.office} /> {CLABEL[c.category]} | <span className={'pri pri-' + c.priority}>{PLABEL[c.priority]}</span> | {c.status === 'open' ? <span className='tag open'>Open</span> : <span className='tag ok'>Resolved</span>}{c.overdue ? <span className='over-t'> | Overdue</span> : null}</p>
        </div>
        <Link href='/support/list' className='btn ghost'>Back to list</Link>
      </div>
      <Flash sp={sp} />

      <div className='card'>
        <h3>The Complaint</h3>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{c.description}</p>
        <div className='kpis' style={{ marginBottom: 0 }}>
          <div className='card kpi alt'><span>Raised by</span><b style={{ fontSize: 15 }}>{c.raised_name || '-'}</b><small>{fmtDay(c.created_ms)}, {fmt12(c.created_ms)}</small></div>
          <div className='card kpi alt'><span>Handling</span><b style={{ fontSize: 15 }}>{c.assigned_name || 'Not assigned'}</b></div>
          <div className='card kpi alt'><span>Responsible</span><b style={{ fontSize: 15 }}>{c.resp_name || 'Not tagged'}</b>{c.resp_note ? <small>{c.resp_note}</small> : null}</div>
          <div className={'card kpi alt' + (c.overdue ? ' neg' : '')}><span>Due</span><b style={{ fontSize: 15 }}>{c.due_on}</b>{c.overdue ? <small>Overdue</small> : null}</div>
          <div className='card kpi alt'><span>From</span><b style={{ fontSize: 15 }}>{c.complainant_name || WLABEL[c.complainant_type]}</b><small>{c.complainant_name ? WLABEL[c.complainant_type] : ''}{c.complainant_phone ? ' ' + c.complainant_phone : ''}</small></div>
        </div>
        {c.location ? <p className='muted' style={{ marginBottom: 0 }}>Where: {c.location}</p> : null}
      </div>

      {files.length ? (
        <div className='card'>
          <h3>Pictures And Files ({files.length})</h3>
          {pics.length ? (
            <div className='cpics'>
              {pics.map((f) => <a key={f.id} href={'/support/file/' + f.id} target='_blank' rel='noreferrer'><img src={'/support/file/' + f.id} alt={f.name} loading='lazy' /></a>)}
            </div>
          ) : null}
          {docs.map((f) => <p key={f.id} style={{ margin: '6px 0' }}><a href={'/support/file/' + f.id} target='_blank' rel='noreferrer'>{f.name}</a> <span className='muted'>({Math.max(1, Math.round(f.size / 1024))} KB)</span></p>)}
        </div>
      ) : null}

      {c.status === 'resolved' ? (
        <div className='card'>
          <h3>Resolution</h3>
          <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{c.resolution}</p>
          <p className='muted'>Resolved by {c.resolved_name || '-'} on {fmtDay(c.resolved_ms)}, {fmt12(c.resolved_ms)}</p>
          {mgr || c.raised_by === user.id ? (
            <form action={reopenComplaint} className='form'>
              <input type='hidden' name='id' value={c.id} />
              <label className='wide'>Not fixed? Say why<input name='why' maxLength={500} placeholder='Optional' autoComplete='off' /></label>
              <button className='btn' type='submit'>Reopen</button>
            </form>
          ) : null}
        </div>
      ) : null}

      {mgr ? (
        <div className='card'>
          <h3>Manage</h3>
          <form action={assignComplaint} className='form'>
            <input type='hidden' name='id' value={c.id} />
            <label>Assign to
              <select name='assignee' defaultValue={c.assigned_to || ''} required>
                <option value='' disabled>Choose</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <button className='btn' type='submit'>Assign</button>
          </form>
          <form action={tagResponsible} className='form' style={{ marginTop: 12 }}>
            <input type='hidden' name='id' value={c.id} />
            <label>Responsible (support team)
              <select name='hk' defaultValue={c.resp_hk_id || ''}>
                <option value=''>Nobody</option>
                {team.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.office}{p.dept ? ', ' + p.dept : ''})</option>)}
              </select>
            </label>
            <label>Or an OpsTrack user
              <select name='ruser' defaultValue={c.resp_user_id || ''}>
                <option value=''>Nobody</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className='wide'>Floor or area, and why<input name='resp_note' maxLength={200} defaultValue={c.resp_note || ''} placeholder='For example: 2nd floor east wing, washroom not cleaned' autoComplete='off' /></label>
            <button className='btn' type='submit'>Tag responsible person</button>
          </form>
          <form action={updateComplaint} className='form' style={{ marginTop: 12 }}>
            <input type='hidden' name='id' value={c.id} />
            <label>Priority
              <select name='priority' defaultValue={c.priority}>{PRIOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label>Category
              <select name='category' defaultValue={c.category}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label>Due date<input type='date' name='due_on' defaultValue={c.due_on} required /></label>
            <button className='btn' type='submit'>Save changes</button>
          </form>
        </div>
      ) : null}

      <div className='card'>
        <h3>Timeline</h3>
        {notes.length ? (
          <div className='ctime'>
            {notes.map((n) => (
              <div key={n.id} className={'cnote k-' + n.kind}>
                <b>{n.name || 'Someone'}</b> <span className='muted'>{fmtDay(n.at_ms)}, {fmt12(n.at_ms)}</span>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.note}</div>
              </div>
            ))}
          </div>
        ) : <p className='muted'>No updates yet.</p>}
        <form action={addNote} className='form' style={{ marginTop: 12 }}>
          <input type='hidden' name='id' value={c.id} />
          <label className='wide'>Add an update<textarea name='note' rows={2} maxLength={1000} required placeholder='What is happening with this complaint?' /></label>
          <button className='btn' type='submit'>Add update</button>
        </form>
      </div>

      {c.status === 'open' && mineToHandle ? (
        <div className='card'>
          <h3>Resolve</h3>
          <form action={resolveComplaint} className='form'>
            <input type='hidden' name='id' value={c.id} />
            <label className='wide'>What was done to resolve it<textarea name='resolution' rows={3} maxLength={1000} required placeholder='Describe the fix so the person who raised it knows.' /></label>
            <button className='btn primary' type='submit'>Mark as resolved</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
