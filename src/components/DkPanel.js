import { linkDkPerson, unlinkDkPerson, saveDkTime } from '@/lib/roster-actions';
import { siteTag, comparePeople, sortSites, matchSite } from '@/lib/dk-sites';
import OfficeTag from '@/components/OfficeTag';
import DkRefresh from '@/components/DkRefresh';

// Dastarkhawan: who has checked in today (from the facial attendance app), when the data was last updated,
// and people not yet linked to their facial app record.
export default function DkPanel({ rows, team = [], allSites = [], siteToday = {}, leaveToday = {}, todayKey = '', teamSize, status, unlinked, linked = [], edit, canAll = false }) {
  const out = rows.filter((r) => r.check_out).length;
  const inNow = rows.length - out;
  // One line per team member, in site order (ISB, LHR, OKA, APL): when they came, when they left, and where they are now.
  const today = new Map(rows.map((r) => [r.id, r]));
  const list = team
    .map((p) => ({ ...p, codes: (p.sites || []).map((x) => x.site), t: today.get(p.id) }))
    .sort(comparePeople);
  const onLeave = list.filter((p) => !p.t && leaveToday[p.id] && leaveToday[p.id].hours == null).length;
  return (
    <div className='card dkpanel'>
      <div className='dkp-head'>
        <div>
          <h3>Checked in today</h3>
          <p className='muted'>
            From the facial attendance app{status.at ? ', updated ' + status.at : ''}. {rows.length} of {teamSize} checked in{rows.length ? ' (' + inNow + ' still on site, ' + out + ' left)' : ''}{onLeave ? ', ' + onLeave + ' on leave' : ''}.
          </p>
        </div>
        {edit ? (
          <DkRefresh back='today' canAll={canAll} />
        ) : null}
      </div>
      {status.error ? <p className='dkp-err'>Could not reach the facial attendance app just now ({status.error}). Showing what was last received.</p> : null}
      {list.length ? (
        <div className='tablewrap dk-sticky'>
          <table className='tx dkt dkt-fit'>
            <thead><tr><th>Team member</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const t = p.t;
                const site = siteTag(p.codes, allSites);
                // Where they checked in: a site picked by hand wins; else the site sent with the check-in; else the site on their facial app staff record.
                const picked = siteToday[p.id] || '';
                const fromCheckin = t ? matchSite(t.app_site, allSites) : '';
                const fromStaff = t ? matchSite(t.site, allSites) : '';
                const at = picked || fromCheckin || fromStaff;
                const how = picked ? 'picked by hand' : fromCheckin ? 'from the facial app check-in' : fromStaff ? 'from the facial app staff site' : '';
                return (
                  <tr key={p.id}>
                    <td className='c-title'>
                      {site ? <span title={sortSites(p.codes).join(' \u00b7 ')}><OfficeTag o={site} /></span> : null}<b>{p.name}</b>
                      {p.codes.length > 1 && t ? (
                        <>
                          {at ? <span className='dka-pill ok' title={how}>at {at}</span> : <span className='dka-pill warn'>site not known</span>}
                          {edit ? (
                            <details className='dkp-change'>
                              <summary>{at ? 'change' : 'pick site'}</summary>
                              <form action={saveDkTime} className='dkp-site'>
                                <input type='hidden' name='id' value={p.id} />
                                <input type='hidden' name='day' value={todayKey} />
                                <input type='hidden' name='m' value={todayKey.slice(0, 7)} />
                                <input type='hidden' name='back' value='today' />
                                <select name='site' defaultValue={at} aria-label={'Site of ' + p.name + ' today'}>
                                  <option value=''>Pick the site</option>
                                  {sortSites(p.codes).map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button className='btn' type='submit'>Save</button>
                              </form>
                            </details>
                          ) : null}
                        </>
                      ) : null}
                    </td>
                    <td className='c-meta nw'><small className='dklbl'>In </small>{t ? t.check_in : <span className='muted'>-</span>}</td>
                    <td className='c-meta nw'><small className='dklbl'>Out </small>{t && t.check_out ? t.check_out : <span className='muted'>-</span>}</td>
                    <td className='c-meta'>
                      {!t ? (leaveToday[p.id] && leaveToday[p.id].hours == null ? <span className='dka-pill leave' title={leaveToday[p.id].label}>On leave</span> : <><span className='dka-pill'>Not in yet</span>{leaveToday[p.id] ? <small className='muted'> leave {leaveToday[p.id].hours} h</small> : null}</>) : t.check_out ? <span className='dka-pill'>Left</span> : <span className='dka-pill ok'>On site</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className='muted'>Nobody has checked in yet today.</p>
      )}
      {edit && linked.length ? (
        <details className='dkp-link'>
          <summary>Linked to the facial app ({linked.length})</summary>
          <p className='muted'>Each person here gets their check-ins from the facial app staff record shown. If a name is different, check that it is really the same person, and unlink it if not.</p>
          {linked.map((l) => {
            const same = String(l.fname || '').trim().toLowerCase() === String(l.name).trim().toLowerCase();
            return (
              <form key={l.id} action={unlinkDkPerson} className='dkp-form'>
                <input type='hidden' name='id' value={l.id} />
                <b>{l.name}</b>
                <span className={same ? 'muted' : 'dkp-diff'}>{l.fname ? l.fname + ' (' + l.emp_id + (l.fsite ? ', ' + l.fsite.replace(/^BOLDDastarkhawan\s*/i, '') : '') + ')' : l.emp_id + ' (not in the facial app list)'}{same ? '' : ' - different name'}</span>
                <button className='btn' type='submit'>Unlink</button>
              </form>
            );
          })}
        </details>
      ) : null}
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
