import 'server-only';
import { q } from './db';
import { sendPush } from './push';
import { notifyRoles } from './notify';
import { TZ } from './att';

const LATE_MIN = 10;

// Tell the guards of one office (bell and phone push).
async function notifyGuards(officeId, message) {
  const rows = await q(
    `INSERT INTO pc2_notifications (user_id, message, link) SELECT id, $1::text, '/visitors' FROM pc2_users WHERE active AND role = 'guard' AND office_id = $2 RETURNING user_id`,
    [message, officeId]
  );
  await sendPush(rows.map((r) => r.user_id), { title: 'Visitor reminder', body: message, url: '/visitors' });
}

const who = (r) => r.name + (r.company ? ' (' + r.company + ')' : '') + (r.host ? ', meeting ' + r.host : '');

// Reminders for announced visitors still waiting: 15 minutes before, 5 minutes before, and 10 minutes late (Sr. Ops Manager and Sr. Support Officer too).
// Each reminder is claimed with one UPDATE, so it is sent once however many times this runs or who triggers it.
export async function runVisitorReminders() {
  const out = { five: 0, fifteen: 0, late: 0 };
  try {
    const cols = `e.id, e.office_id, e.name, e.company, e.host, to_char(e.due_at AT TIME ZONE '${TZ}', 'HH12:MI AM') AS at_label`;
    const five = await q(
      `UPDATE pc2_expected e SET rem5_at = now(), rem15_at = COALESCE(rem15_at, now()) WHERE e.status = 'waiting' AND e.rem5_at IS NULL AND e.due_at > now() AND e.due_at <= now() + interval '5 minutes' RETURNING ${cols}`
    );
    for (const r of five) await notifyGuards(r.office_id, 'Arriving in 5 minutes (' + r.at_label + '): ' + who(r));
    const fifteen = await q(
      `UPDATE pc2_expected e SET rem15_at = now() WHERE e.status = 'waiting' AND e.rem15_at IS NULL AND e.due_at > now() + interval '5 minutes' AND e.due_at <= now() + interval '15 minutes' RETURNING ${cols}`
    );
    for (const r of fifteen) await notifyGuards(r.office_id, 'Arriving in 15 minutes (' + r.at_label + '): ' + who(r));
    const late = await q(
      `UPDATE pc2_expected e SET late_at = now() WHERE e.status = 'waiting' AND e.late_at IS NULL AND e.due_at < now() - interval '${LATE_MIN} minutes' AND e.due_at > now() - interval '1 day' RETURNING ${cols}`
    );
    for (const r of late) {
      const msg = 'Late: ' + who(r) + ' was expected at ' + r.at_label + ' and is not marked arrived or no show.';
      await notifyGuards(r.office_id, msg);
      await notifyRoles(['om', 'sso'], msg, '/visitors');
    }
    out.five = five.length;
    out.fifteen = fifteen.length;
    out.late = late.length;
  } catch {
    // reminders are best effort and must never break a page
  }
  return out;
}
