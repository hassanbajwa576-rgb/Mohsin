import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ROLE_LABEL } from '@/lib/fmt';

const ENTITIES = {
  expense: 'Expenses',
  received_funds: 'Funds from Accounts',
  advance: 'Advances to SO',
  batch: 'Accounts batches',
  user: 'Team and accounts',
};

export default async function LogsPage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const entity = ENTITIES[sp.entity] ? sp.entity : 'all';
  const actor = sp.actor || 'all';
  const text = (sp.text || '').trim();

  const c = [];
  const p = [];
  const add = (sql, v) => { p.push(v); c.push(sql.replace('?', '$' + p.length)); };
  if (entity !== 'all') add('entity = ?', entity);
  if (actor !== 'all') add('actor_name = ?', actor);
  if (text) add('summary ILIKE ?', '%' + text + '%');
  const where = c.length ? 'WHERE ' + c.join(' AND ') : '';

  const [rows, actors] = await Promise.all([
    q(`SELECT id, to_char(at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI:SS') AS at, actor_name, actor_role, action, entity, entity_id, summary, before, after FROM pc2_audit ${where} ORDER BY id DESC LIMIT 300`, p),
    q('SELECT DISTINCT actor_name FROM pc2_audit ORDER BY actor_name'),
  ]);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Logs</h1>
          <p className='muted'>Every change made in PettyTrack - who did it, when, and what changed (times in Pakistan time)</p>
        </div>
      </div>

      <form method='get' className='card filters'>
        <label>Area
          <select name='entity' defaultValue={entity}>
            <option value='all'>Everything</option>
            {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Done by
          <select name='actor' defaultValue={actor}>
            <option value='all'>Everyone</option>
            {actors.map((a) => <option key={a.actor_name}>{a.actor_name}</option>)}
          </select>
        </label>
        <label>Search<input name='text' defaultValue={text} placeholder='e.g. expense #12' /></label>
        <button className='btn' type='submit'>Apply</button>
        <Link href='/logs' className='btn ghost'>Reset</Link>
      </form>

      <div className='card'>
        {rows.length === 0 ? <p className='muted'>No changes recorded yet.</p> : (
          <div className='tablewrap'>
            <table>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>What happened</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className='nw'>{r.at}</td>
                    <td>{r.actor_name}<div className='muted'>{ROLE_LABEL[r.actor_role] || ''}</div></td>
                    <td><span className={'badge log-' + r.action}>{r.action}</span></td>
                    <td>{ENTITIES[r.entity] || r.entity}{r.entity_id ? ' #' + r.entity_id : ''}</td>
                    <td>
                      {r.summary}
                      {r.before || r.after ? (
                        <details>
                          <summary className='muted'>Details</summary>
                          {r.before ? <pre className='json'>Before: {JSON.stringify(r.before)}</pre> : null}
                          {r.after ? <pre className='json'>After: {JSON.stringify(r.after)}</pre> : null}
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className='totals'>Showing the latest {rows.length} entries</p>
      </div>
    </>
  );
}
