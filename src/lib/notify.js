import 'server-only';
import { q } from './db';

// Notify every active user holding one of the given roles (optionally skipping one user).
export async function notifyRoles(roles, message, link = '/', exceptUserId = 0) {
  await q(
    `INSERT INTO pc2_notifications (user_id, message, link) SELECT id, $1::text, $2::text FROM pc2_users WHERE active AND role = ANY($3::text[]) AND id <> $4`,
    [message, link, roles, exceptUserId]
  );
}

export async function notifyUser(userId, message, link = '/') {
  await q(`INSERT INTO pc2_notifications (user_id, message, link) VALUES ($1, $2, $3)`, [userId, message, link]);
}
