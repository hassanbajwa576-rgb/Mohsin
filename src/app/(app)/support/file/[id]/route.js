import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { canSee, complaintById } from '@/lib/support';

export const dynamic = 'force-dynamic';

// Open a picture or PDF attached to a complaint, only for people who may see that complaint.
export async function GET(req, { params }) {
  const u = await getUser();
  if (!u) return new Response('Sign in first', { status: 401 });
  const { id } = await params;
  const n = Number(id);
  const f = (await q("SELECT f.id, f.complaint_id, f.name, f.mime, encode(f.data, 'base64') AS b64 FROM pc2_complaint_files f WHERE f.id = $1", [Number.isInteger(n) ? n : 0]))[0];
  if (!f) return new Response('Not found', { status: 404 });
  const c = await complaintById(f.complaint_id);
  if (!c || !canSee(u, c)) return new Response('Not allowed', { status: 403 });
  return new Response(Buffer.from(f.b64, 'base64'), {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': 'inline; filename="' + String(f.name).replace(/[^\w.\- ]/g, '_') + '"',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
