import { q } from './db';

export const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' };
export const SOURCE = { manual: 'Added here', outlook: 'Outlook', email: 'Email' };

export { DOMAINS, DOMAIN, DOMAIN_ORDER } from './task-domains';

// The people a person can give tasks to and follow: the Sr. Ops Manager sees everyone who has the Tasks page,
// the Sr. SO sees the Support Officers who have it, anyone else only themselves.
export async function taskPeople(user) {
  if (user.role !== 'om' && user.role !== 'sso') return [];
  return q(
    `SELECT u.id, u.name, u.role FROM pc2_users u LEFT JOIN pc2_roles r ON r.id = u.role_id AND r.active
     WHERE u.active AND u.role NOT IN ('om', 'guard') AND u.id <> $1 AND ($2 OR u.role = 'so')
       AND (u.role = 'sso' OR (',' || u.perms || ',') LIKE '%,tasks,%' OR (',' || COALESCE(r.perms, '') || ',') LIKE '%,tasks,%')
     ORDER BY CASE u.role WHEN 'sso' THEN 0 ELSE 1 END, u.name`,
    [user.id, user.role === 'om']
  );
}

export const REPEAT = { '': 'Does not repeat', daily: 'Every day', weekly: 'Every week', monthly: 'Every month', friday: 'Every Friday', m15: 'On the 15th of every month', mend: 'Last working day of every month' };
export const REPEAT_SHORT = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', friday: 'every Friday', m15: 'on the 15th', mend: 'on the last working day' };

const COLS = `t.id, t.title, t.details, t.priority, t.status, t.source, t.domain, t.user_id, t.created_by, t.repeat_every, ou.name AS owner_name, cu.name AS creator_name,
  to_char(t.due_on, 'YYYY-MM-DD') AS due_on, to_char(t.done_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS done_on`;
const FROM = `FROM pc2_tasks t JOIN pc2_users ou ON ou.id = t.user_id LEFT JOIN pc2_users cu ON cu.id = t.created_by`;

// Tasks of the given people (ids) for one domain, or all domains when domain is empty: open ones first, by due date then priority.
// kind narrows the list to one summary box: today, overdue or high (priority).
export async function taskRows(ids, show, domain, kind = '', today = '1970-01-01') {
  const where = show === 'done' ? "t.status = 'done'" : show === 'all' ? 'TRUE' : "t.status = 'open'";
  return q(
    `SELECT ${COLS} ${FROM} WHERE t.user_id = ANY($1::int[]) AND ($2 = '' OR t.domain = $2) AND ${where}
       AND ($3 = '' OR ($3 = 'today' AND t.due_on = $4::date) OR ($3 = 'overdue' AND t.due_on < $4::date) OR ($3 = 'high' AND t.priority = 'high'))
     ORDER BY (t.status = 'done'), t.due_on NULLS LAST, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.id DESC LIMIT 300`,
    [ids, domain || '', kind || '', today]
  );
}

// What needs attention soon: late, due in the next week, or marked high priority. Late first.
export async function attentionRows(ids, today) {
  return q(
    `SELECT ${COLS} ${FROM}
     WHERE t.user_id = ANY($1::int[]) AND t.status = 'open' AND (t.priority = 'high' OR t.due_on <= ($2::date + 7))
     ORDER BY t.due_on NULLS LAST, CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.id DESC LIMIT 12`,
    [ids, today]
  );
}

// Open, due-today and overdue counts per domain, plus the totals for the summary row.
export async function domainCounts(ids, today) {
  const rows = await q(
    `SELECT domain, COUNT(*)::int AS open,
            COUNT(*) FILTER (WHERE due_on < $2::date)::int AS overdue,
            COUNT(*) FILTER (WHERE due_on = $2::date)::int AS today,
            COUNT(*) FILTER (WHERE priority = 'high')::int AS high
     FROM pc2_tasks WHERE user_id = ANY($1::int[]) AND status = 'open' GROUP BY domain`,
    [ids, today]
  );
  const by = Object.fromEntries(rows.map((r) => [r.domain, r]));
  const total = rows.reduce((a, r) => ({ open: a.open + r.open, overdue: a.overdue + r.overdue, today: a.today + r.today, high: a.high + r.high }), { open: 0, overdue: 0, today: 0, high: 0 });
  return { by, total };
}

// Open and overdue tasks per person, for the person switch.
export async function peopleCounts(ids, today) {
  const rows = await q(
    `SELECT user_id, COUNT(*)::int AS open, COUNT(*) FILTER (WHERE due_on < $2::date)::int AS overdue
     FROM pc2_tasks WHERE user_id = ANY($1::int[]) AND status = 'open' GROUP BY user_id`,
    [ids, today]
  );
  return Object.fromEntries(rows.map((r) => [r.user_id, r]));
}

export async function taskOne(ids, id) {
  return (await q(`SELECT ${COLS} ${FROM} WHERE t.id = $1 AND t.user_id = ANY($2::int[])`, [id, ids]))[0];
}

// Whole days from today to a due date (negative when it is already late).
export function daysFrom(today, due) {
  return Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const niceDate = (d) => Number(d.slice(8, 10)) + ' ' + MONTHS[Number(d.slice(5, 7)) - 1];

// How the due date reads on the card, and which colour it gets.
export function dueLabel(t, today) {
  if (t.status === 'done') return { text: 'Done' + (t.done_on ? ' ' + niceDate(t.done_on) : ''), cls: 'tk-done' };
  if (!t.due_on) return { text: 'No date', cls: 'tk-none' };
  const n = daysFrom(today, t.due_on);
  if (n < 0) return { text: 'Overdue ' + -n + (n === -1 ? ' day' : ' days'), cls: 'tk-over' };
  if (n === 0) return { text: 'Today', cls: 'tk-today' };
  if (n === 1) return { text: 'Tomorrow', cls: '' };
  return { text: niceDate(t.due_on), cls: '' };
}
