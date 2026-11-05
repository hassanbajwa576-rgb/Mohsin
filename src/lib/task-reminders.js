import 'server-only';
import { q } from './db';
import { notifyUser } from './notify';
import { todayKey } from './att';

const hourKarachi = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }).format(new Date()));

// Once a day (from 9 am Karachi time) every person is reminded of open tasks that are late, due today or due tomorrow.
// A task keeps coming back each morning until it is finished. Safe to call as often as you like.
export async function runTaskReminders() {
  if (hourKarachi() < 9) return { sent: 0, waiting: 'before 9 am' };
  const today = todayKey();
  const rows = await q(
    `SELECT id, user_id, title, to_char(due_on, 'YYYY-MM-DD') AS due_on FROM pc2_tasks
     WHERE status = 'open' AND due_on IS NOT NULL AND due_on <= $1::date + 1 AND (last_reminded_on IS NULL OR last_reminded_on < $1::date)
     ORDER BY user_id, due_on`,
    [today]
  );
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.user_id)) by.set(r.user_id, []);
    by.get(r.user_id).push(r);
  }
  let sent = 0;
  for (const [uid, list] of by) {
    const late = list.filter((r) => r.due_on < today);
    const now = list.filter((r) => r.due_on === today);
    const soon = list.filter((r) => r.due_on > today);
    const parts = [];
    if (late.length) parts.push(late.length + ' late');
    if (now.length) parts.push(now.length + ' due today');
    if (soon.length) parts.push(soon.length + ' due tomorrow');
    const first = list.slice(0, 2).map((r) => r.title).join(', ');
    await notifyUser(uid, 'Task reminder: ' + parts.join(', ') + ' - ' + first + (list.length > 2 ? ' and ' + (list.length - 2) + ' more' : ''), '/tasks');
    await q('UPDATE pc2_tasks SET last_reminded_on = $1::date WHERE id = ANY($2::int[])', [today, list.map((r) => r.id)]);
    sent++;
  }
  return { sent };
}
