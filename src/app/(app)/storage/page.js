import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The free database plan allows about 0.5 GB. Change this if the plan changes.
const LIMIT_MB = 512;
const mb = (b) => b / 1048576;
const fmtMb = (b) => (mb(b) < 10 ? mb(b).toFixed(2) : mb(b) < 100 ? mb(b).toFixed(1) : Math.round(mb(b)).toString()) + ' MB';

async function one(sql, params = []) {
  try {
    return (await q(sql, params))[0] || {};
  } catch {
    return {};
  }
}

// How much of the free database space is used, what takes it, and how long it should last. Sr. Ops Manager only.
export default async function StoragePage() {
  await requireUser(['om']);
  const total = Number((await one('SELECT pg_database_size(current_database()) AS b')).b || 0);
  let tables = [];
  try {
    tables = await q(
      `SELECT c.relname AS name, pg_total_relation_size(c.oid)::float8 AS bytes, GREATEST(c.reltuples, 0)::float8 AS rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'pc2\\_%'
        ORDER BY bytes DESC LIMIT 12`
    );
  } catch {}
  const photos = await one('SELECT COUNT(*)::int AS n, COALESCE(SUM(length(data)), 0)::float8 AS b FROM pc2_guard_photos');
  const files = await one('SELECT COUNT(*)::int AS n, COALESCE(SUM(size), 0)::float8 AS b FROM pc2_complaint_files');
  const first = await one(`SELECT to_char(LEAST(MIN(at), now()), 'YYYY-MM-DD') AS d, GREATEST(1, EXTRACT(epoch FROM (now() - LEAST(MIN(at), now()))) / 2592000)::float8 AS months FROM pc2_attendance`);
  const att = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE at > now() - interval '30 days')::int AS n30 FROM pc2_attendance`);

  const limit = LIMIT_MB * 1048576;
  const pct = Math.min(100, (total / limit) * 100);
  const months = Number(first.months || 1);
  const perMonth = total / Math.max(1, months); // a rough average since the first attendance entry
  const monthsLeft = perMonth > 0 ? Math.max(0, (limit - total) / perMonth) : null;
  const tone = pct >= 85 ? 'bad' : pct >= 60 ? 'warn' : 'ok';

  return (
    <>
      <div className='head'>
        <div>
          <h1>Storage</h1>
          <p className='muted'>How much of the free database space is used, what takes it, and roughly how long it will last.</p>
        </div>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>Database: {fmtMb(total)} of {LIMIT_MB} MB ({pct.toFixed(1)}%)</h3>
        <div className={'stbar ' + tone}><i style={{ width: Math.max(1, pct) + '%' }} /></div>
        <p className='muted' style={{ marginBottom: 0 }}>
          {monthsLeft == null ? '' : monthsLeft > 120 ? 'At the pace so far (about ' + fmtMb(perMonth) + ' a month) it will last for many years.' : 'At the pace so far (about ' + fmtMb(perMonth) + ' a month) the space lasts roughly ' + Math.round(monthsLeft) + ' more months.'}
          {' '}This is a rough average since the first attendance entry ({first.d || 'n/a'}); photos and uploads make it jump when many are added.
        </p>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>What takes the space</h3>
        <div className='tablewrap'>
          <table className='tx'>
            <thead><tr><th>Table</th><th className='r'>Size</th><th className='r'>Rows (about)</th></tr></thead>
            <tbody>
              {tables.map((t) => (
                <tr key={t.name}>
                  <td className='c-title'><b>{t.name.replace(/^pc2_/, '')}</b></td>
                  <td className='r nw c-meta'>{fmtMb(t.bytes)}</td>
                  <td className='r nw c-meta'>{Math.round(t.rows).toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className='hk-hist'>
          <li><b>Guard pictures</b><span>{photos.n || 0} pictures, {fmtMb(photos.b || 0)} (kept 90 days after the last duty, up to 10 per guard)</span></li>
          <li><b>Complaint files</b><span>{files.n || 0} files, {fmtMb(files.b || 0)}</span></li>
          <li><b>Attendance</b><span>{(att.n || 0).toLocaleString('en-US')} entries in all, {(att.n30 || 0).toLocaleString('en-US')} in the last 30 days</span></li>
        </ul>
      </div>

      <div className='card'>
        <h3 style={{ marginTop: 0 }}>The free hosting plan (Vercel)</h3>
        <ul className='hk-hist'>
          <li><b>Deploys</b><span>About 100 a day. Several changes are batched into one push, so this is not a problem.</span></li>
          <li><b>Pages and API calls</b><span>Every page is built on request and each opens with a few small database queries. For a team of this size this is far below the free limits.</span></li>
          <li><b>Facial app sync</b><span>Runs only when the Dastarkhawan page is opened, at most every 5 minutes, and downloads about 100 KB. Light.</span></li>
          <li><b>Pictures</b><span>Kept in the database (above), not on Vercel, so they count towards the {LIMIT_MB} MB, not towards file storage.</span></li>
        </ul>
        <p className='muted' style={{ marginBottom: 0 }}>Exact monthly use of bandwidth and function time is on the Vercel dashboard under Usage.</p>
      </div>
    </>
  );
}
