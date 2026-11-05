import { q } from './db';

export const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' };
export const SOURCE = { manual: 'Added here', outlook: 'Outlook', email: 'Email' };

// The areas a task can belong to. The first one is the default for a new task.
export const DOMAINS = [
  ['operations', 'Operations'],
  ['hr', 'HR'],
  ['accounts', 'Accounts'],
  ['boldbus', 'BOLDBus'],
  ['bolddastarkhawan', 'BOLDDastarkhawan'],
  ['it', 'IT'],
];
export const DOMAIN = Object.fromEntries(DOMAINS);
// Domains in the order shown on the page (Operations last, as the catch-all).
export const DOMAIN_ORDER = ['hr', 'accounts', 'boldbus', 'bolddastarkhawan', 'it', 'operations'];

const COLS = `id, title, details, priority, status, source, domain, to_char(due_on, 'YYYY-MM-DD') AS due_on, to_char(done_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS done_on`;

// A person's own tasks (nobody else's) for one domain, or all domains when domain is empty: open ones first, by due date then priority.
export async function taskRows(userId, show, domain) {
  const where = show === 'done' ? "status = 'done'" : show === 'all' ? 'TRUE' : "status = 'open'";
  return q(
    `SELECT ${COLS} FROM pc2_tasks WHERE user_id = $1 AND ($2 = '' OR domain = $2) AND ${where}
     ORDER BY (status = 'done'), due_on NULLS LAST, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC LIMIT 300`,
    [userId, domain || '']
  );
}

// What needs attention soon: late, due in the next week, or marked high priority. Late first.
export async function attentionRows(userId, today) {
  return q(
    `SELECT ${COLS} FROM pc2_tasks
     WHERE user_id = $1 AND status = 'open' AND (priority = 'high' OR due_on <= ($2::date + 7))
     ORDER BY due_on NULLS LAST, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id DESC LIMIT 12`,
    [userId, today]
  );
}

// Open and overdue counts per domain, plus the totals for the summary row.
export async function domainCounts(userId, today) {
  const rows = await q(
    `SELECT domain, COUNT(*)::int AS open,
            COUNT(*) FILTER (WHERE due_on < $2::date)::int AS overdue,
            COUNT(*) FILTER (WHERE due_on = $2::date)::int AS today
     FROM pc2_tasks WHERE user_id = $1 AND status = 'open' GROUP BY domain`,
    [userId, today]
  );
  const by = Object.fromEntries(rows.map((r) => [r.domain, r]));
  const total = rows.reduce((a, r) => ({ open: a.open + r.open, overdue: a.overdue + r.overdue, today: a.today + r.today }), { open: 0, overdue: 0, today: 0 });
  return { by, total };
}

export async function taskOne(userId, id) {
  return (await q(`SELECT ${COLS} FROM pc2_tasks WHERE id = $1 AND user_id = $2`, [id, userId]))[0];
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
