import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Polled by the notification bell so new messages appear without a page reload.
export async function GET() {
  const u = await getUser();
  if (!u) return Response.json({ unread: 0 }, { status: 401 });
  const c = await q('SELECT count(*)::int AS n FROM pc2_notifications WHERE user_id = $1 AND NOT is_read', [u.id]);
  const l = await q('SELECT message, link FROM pc2_notifications WHERE user_id = $1 AND NOT is_read ORDER BY id DESC LIMIT 1', [u.id]);
  return Response.json({ unread: c[0].n, latest: l[0] || null });
}
