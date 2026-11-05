import 'server-only';
import { q } from './db';
import { notifyUser } from './notify';
import { todayKey } from './att';
import { isoDay } from './weekdays';

const hourKarachi = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }).format(new Date()));

// On each chosen weekday the routine puts a fresh task, due that day, on the list of the person it is set for (once a day, from 7 am Karachi time).
// force skips the 7 am wait, used when a routine has just been created. Safe to call as often as you like.
export async function runRoutines(force = false) {
  try {
    if (!force && hourKarachi() < 7) return 0;
    const today = todayKey();
    const wd = String(isoDay(today));
    const rules = await q(
      `UPDATE pc2_task_rules SET last_made_on = $1::date WHERE active AND (last_made_on IS NULL OR last_made_on < $1::date) AND (',' || weekdays || ',') LIKE '%,' || $2 || ',%'
       RETURNING id, user_id, created_by, title, details, priority, domain`,
      [today, wd]
    );
    for (const r of rules) {
      await q(
        `INSERT INTO pc2_tasks (user_id, created_by, title, details, due_on, priority, domain, source, source_ref) VALUES ($1,$2,$3,$4,$5::date,$6,$7,'routine',$8) ON CONFLICT DO NOTHING`,
        [r.user_id, r.created_by || r.user_id, r.title, r.details, today, r.priority, r.domain, r.id + ':' + today]
      );
      await notifyUser(r.user_id, 'Routine task due today: ' + r.title, '/tasks');
    }
    return rules.length;
  } catch {
    return 0;
  }
}
