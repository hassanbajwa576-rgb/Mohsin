import { deactivateHkPerson, activateHkPerson } from '@/lib/roster-actions';
import { DEACT_REASONS, ACT_REASONS } from '@/lib/hk-status';
import OfficeTag from '@/components/OfficeTag';

const tagOf = (p) => ((p.sites || []).length > 1 ? p.sites.length + ' sites' : (p.sites || [])[0] ? p.sites[0].site : p.site || p.office || '');

// "Deactivate" next to a team member: reason, with effect from (w.e.f.) date and remarks.
export function DeactivateForm({ p, today }) {
  return (
    <details className='entry-edit'>
      <summary className='btn ghost'>Deactivate</summary>
      <form action={deactivateHkPerson} className='entry-edit-form'>
        <input type='hidden' name='id' value={p.id} />
        <label>Reason
          <select name='reason' required defaultValue=''>
            <option value=''>Choose a reason</option>
            {DEACT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label>With effect from<input type='date' name='eff' defaultValue={today} required /></label>
        <label>Remarks (needed for Other)<input name='remarks' maxLength={200} placeholder='For example: left for another job' autoComplete='off' /></label>
        <button className='btn primary' type='submit'>Deactivate</button>
      </form>
    </details>
  );
}

// Deactivated team members with why and when, an Activate form for each, and the history of every change.
export function InactiveCard({ rows, history, today }) {
  if (!rows.length && !history.length) return null;
  return (
    <details className='card hkstat'>
      <summary>Inactive team members ({rows.length}) and status history</summary>
      {rows.length ? (
        <div className='tablewrap' style={{ marginTop: 10 }}>
          <table className='tx'>
            <thead><tr><th>Name</th><th>Role</th><th>Deactivated</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className='c-title'><OfficeTag o={tagOf(p)} /><b>{p.name}</b></td>
                  <td className='c-meta'>{p.dept || '-'}</td>
                  <td className='c-meta'>
                    {p.reason ? <><b>{p.reason}</b>{p.eff ? ', w.e.f. ' + p.eff : ''}{p.remarks ? ' - ' + p.remarks : ''}</> : 'Removed earlier (no reason recorded)'}
                    {p.active_from ? <div className='dkp-diff'>Re-joining w.e.f. {p.active_from}</div> : null}
                  </td>
                  <td className='act'>
                    <details className='entry-edit'>
                      <summary className='btn'>Activate</summary>
                      <form action={activateHkPerson} className='entry-edit-form'>
                        <input type='hidden' name='id' value={p.id} />
                        <label>Reason
                          <select name='reason' required defaultValue=''>
                            <option value=''>Choose a reason</option>
                            {ACT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </label>
                        <label>With effect from<input type='date' name='eff' defaultValue={today} required /></label>
                        <label>Remarks (needed for Other)<input name='remarks' maxLength={200} placeholder='For example: rejoined after 2 months' autoComplete='off' /></label>
                        <button className='btn primary' type='submit'>Activate</button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className='muted'>Nobody is deactivated.</p>}
      {history.length ? (
        <>
          <h4 style={{ margin: '16px 0 6px' }}>Status history</h4>
          <ul className='hk-hist'>
            {history.map((h) => (
              <li key={h.id}>
                <span className='nw'>{h.eff}</span>
                <b>{h.name}</b>
                <span className={'hk-act ' + h.action}>{h.action === 'activate' ? 'Activated' : 'Deactivated'}</span>
                <span>{h.reason}{h.remarks ? ' - ' + h.remarks : ''}</span>
                <span className='muted'>{h.by_name ? 'by ' + h.by_name : ''}{h.on_day ? ' on ' + h.on_day : ''}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  );
}
