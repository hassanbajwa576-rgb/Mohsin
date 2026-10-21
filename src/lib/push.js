import 'server-only';
import webpush from 'web-push';
import { q } from './db';

// Phone notifications (Web Push). The signing keys are made once and kept in the database.
async function keys() {
  let r = await q('SELECT pub, priv FROM pc2_push_keys WHERE id = 1');
  if (!r[0]) {
    const k = webpush.generateVAPIDKeys();
    await q('INSERT INTO pc2_push_keys (id, pub, priv) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING', [k.publicKey, k.privateKey]);
    r = await q('SELECT pub, priv FROM pc2_push_keys WHERE id = 1');
  }
  return r[0];
}

export async function publicKey() {
  return (await keys()).pub;
}

/** Send a notification to every phone or browser the given people have switched notifications on for. Never throws. */
export async function sendPush(userIds, { title = 'OpsTrack', body = '', url = '/notifications' } = {}) {
  try {
    const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return;
    const k = await keys();
    webpush.setVapidDetails('mailto:opstrack@alphabold.com', k.pub, k.priv);
    const subs = await q('SELECT id, endpoint, p256dh, auth FROM pc2_push_subs WHERE user_id = ANY($1::int[])', [ids]);
    const payload = JSON.stringify({ title, body: String(body).slice(0, 180), url });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) await q('DELETE FROM pc2_push_subs WHERE id = $1', [s.id]);
        }
      })
    );
  } catch {
    // a failed phone notification must never break the action that caused it
  }
}