import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Save (or refresh) this phone or browser so the person gets notifications.
export async function POST(req) {
  const u = await getUser();
  if (!u) return Response.json({ ok: false }, { status: 401 });
  let sub = null;
  try {
    sub = await req.json();
  } catch {
    sub = null;
  }
  const endpoint = sub && String(sub.endpoint || '');
  const p256dh = sub && sub.keys && String(sub.keys.p256dh || '');
  const auth = sub && sub.keys && String(sub.keys.auth || '');
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith('https://')) return Response.json({ ok: false }, { status: 400 });
  await q(
    'INSERT INTO pc2_push_subs (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4) ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth',
    [u.id, endpoint, p256dh, auth]
  );
  return Response.json({ ok: true });
}

// Switch notifications off for this phone or browser.
export async function DELETE(req) {
  const u = await getUser();
  if (!u) return Response.json({ ok: false }, { status: 401 });
  let sub = null;
  try {
    sub = await req.json();
  } catch {
    sub = null;
  }
  if (sub && sub.endpoint) await q('DELETE FROM pc2_push_subs WHERE endpoint = $1 AND user_id = $2', [String(sub.endpoint), u.id]);
  return Response.json({ ok: true });
}