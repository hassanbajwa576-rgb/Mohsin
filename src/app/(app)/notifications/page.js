import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await q(
    `SELECT id, message, link, is_read, to_char(created_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS at FROM pc2_notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 100`,
    [user.id]
  );
  await q('UPDATE pc2_notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [user.id]);

  return (
    <>
      <div className='head'>
        <div>
          <h1>Notifications</h1>
          <p className='muted'>New expenses, advances and approvals show up here as soon as they happen</p>
        </div>
      </div>
      <div className='card'>
        {rows.length === 0 ? <p className='muted'>You are all caught up.</p> : (
          <ul className='notes'>
            {rows.map((n) => (
              <li key={n.id}>
                <Link href={n.link || '/'} className={n.is_read ? '' : 'unread'}>
                  <span>{n.message}</span>
                  <small>{n.at}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
