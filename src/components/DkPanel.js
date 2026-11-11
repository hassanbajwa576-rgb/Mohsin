import { refreshDk, linkDkPerson } from '@/lib/roster-actions';

// Dastarkhawan: who has checked in today (from the facial attendance app), when the data was last updated,
// and people not yet linked to their facial app record.
export default function DkPanel({ rows, teamSize, status, unlinked, edit }) {
  const out = rows.filter((r) => r.check_out).length;
  const inNow = rows.length - out;
  return (
    <div className='card dkpanel'>
      <div className='dkp-head'>
        <div>
          <h3>Checked in today</h3>
          <p className='muted'>
            From the facial attendance app{status.at ? ', updated ' + status.at : ''}. {rows.length} of {teamSize} checked in{rows.length ? ' (' + inNow + ' still on site, ' + out + ' left)' : ''}.
          </p>
        </div>
        {edit ? (
          <form action={refreshDk}>
            <button className='btn' type='submit'>Refresh now</button>
          </form>
        ) : null}
      </div>
      {status.error ? <p className='dkp-err'>Could not reach the facial attendance app just now ({status.error}). Showing what was last received.</p> : null}
      {rows.length ? (
        <ul className='dkp-list'>
          {rows.map((r) => (
            <li key={r.id}>
              <b>{r.name}</b>
              <span className='muted'>{r.site ? r.site.replace(/^BOLDDastarkhawan\s*/i, '') : ''}</span>
              <span className='dkp-t'>In {r.check_in}</span>
              <span className={'dkp-t' + (r.check_out ? '' : ' dkp-on')}>{r.check_out ? 'Out ' + r.check_out : 'On site'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='muted'>Nobody has checked in yet today.</p>
      )}
      {edit && unlinked.people.length ? (
        <details className='dkp-link'>
          <summary>Not linked to the facial app ({unlinked.people.length})</summary>
          <p className='muted'>Their check-ins cannot show until they are linked. People with the same name are linked automatically.</p>
          {unlinked.people.map((p) => (
            <form key={p.id} action={linkDkPerson} className='dkp-form'>
              <input type='hidden' name='id' value={p.id} />
              <b>{p.name}</b>
              <select name='emp' defaultValue=''>
                <option value=''>Choose the facial app staff member</option>
                {unlinked.staff.map((s) => <option key={s.emp_id} value={s.emp_id}>{s.name} ({s.emp_id})</option>)}
              </select>
              <button className='btn' type='submit'>Link</button>
            </form>
          ))}
        </details>
      ) : null}
    </div>
  );
}
