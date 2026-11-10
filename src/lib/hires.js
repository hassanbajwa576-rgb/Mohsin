// Wording for when a new hire joins: "Joins today at 10:00 AM", "Joins tomorrow", "Joins Thu 12 Nov at 9:30 AM", "Joined 8 Nov".
const t12 = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = Number(m[1]);
  return (h % 12 || 12) + ':' + m[2] + (h >= 12 ? ' PM' : ' AM');
};
const addDay = (key, n) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const timeText = t12;

export function hireWhen(joinDate, joinTime, today) {
  const at = joinTime ? ' at ' + t12(joinTime) : '';
  if (joinDate === today) return 'Joins today' + at;
  if (joinDate === addDay(today, 1)) return 'Joins tomorrow' + at;
  const label = new Date(joinDate + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (joinDate > today ? 'Joins ' : 'Joined ') + label + at;
}
