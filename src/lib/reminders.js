import 'server-only';
import { q } from './db';
import { notifyUser } from './notify';
import { todayKey } from './att';
import { isoDay } from './weekdays';
import { fixedOnOrAfter } from './task-repeat';

// Minutes since midnight in Karachi.
const minuteKarachi = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':');
  return (Number(p[0]) % 24) * 60 + Number(p[1]);
};

// Sends the reminders that are due today, once each, at or after the time chosen for them (Karachi time).
export async function runReminders() {
  try {
    const today = todayKey();
    const wd = String(isoDay(today));
    const nowMin = minuteKarachi();
    const rows = await q(
      `SELECT r.id, r.user_id, r.created_by, r.title, r.note, r.kind, r.weekdays, to_char(r.on_date, 'YYYY-MM-DD') AS on_date, cu.name AS by_name
       FROM pc2_reminders r LEFT JOIN pc2_users cu ON cu.id = r.created_by
       WHERE r.active AND (r.hour * 60 + r.minute) <= $1 AND (r.last_sent_on IS NULL OR r.last_sent_on < $2::date)`,
      [nowMin, today]
    );
    let sent = 0;
    for (const r of rows) {
      let due = false;
      if (r.kind === 'once') due = !!r.on_date && r.on_date <= today;
      else if (r.kind === 'daily') due = true;
      else if (r.kind === 'days') due = (',' + r.weekdays + ',').includes(',' + wd + ',');
      else if (r.kind === 'm15') due = today.slice(8, 10) === '15';
      else if (r.kind === 'mend') due = (await fixedOnOrAfter('mend', today)) === today;
      if (!due) continue;
      const claimed = await q(`UPDATE pc2_reminders SET last_sent_on = $2::date, active = CASE WHEN kind = 'once' THEN FALSE ELSE active END WHERE id = $1 AND (last_sent_on IS NULL OR last_sent_on < $2::date) RETURNING id`, [r.id, today]);
      if (!claimed.length) continue;
      const from = r.created_by && r.created_by !== r.user_id && r.by_name ? ' (from ' + r.by_name + ')' : '';
      await notifyUser(r.user_id, 'Reminder: ' + r.title + (r.note ? ' - ' + r.note : '') + from, '/reminders');
      sent++;
    }
    return sent;
  } catch {
    return 0;
  }
}
