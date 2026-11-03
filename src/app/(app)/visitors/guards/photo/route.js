import { getUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

// A temporary guard's CNIC or guard photo, shown only to people who may use the guard duty page.
export async function GET(req) {
  const user = await getUser();
  if (!user || !can(user, 'guard_duty')) return new Response('Not allowed', { status: 403 });
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  const kind = url.searchParams.get('kind');
  if (!Number.isInteger(id) || !['cnic', 'guard'].includes(kind)) return new Response('Not found', { status: 404 });
  const row = (await q('SELECT mime, data FROM pc2_guard_photos WHERE guard_id = $1 AND kind = $2', [id, kind]))[0];
  if (!row) return new Response('No photo', { status: 404 });
  return new Response(Buffer.from(row.data, 'base64'), {
    headers: { 'Content-Type': row.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
