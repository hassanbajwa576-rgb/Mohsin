import { getUser } from '@/lib/auth';
import { opsbotAnswer } from '@/lib/opsbot';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = await getUser();
  if (!user || user.role === 'guard') return Response.json({ reply: 'Please sign in again.' }, { status: 401 });
  let text = '';
  let ctx = null;
  try {
    const body = await req.json();
    text = String(body.text || '').slice(0, 300);
    ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : null;
  } catch {
    return Response.json({ reply: 'I could not read that.' }, { status: 400 });
  }
  try {
    return Response.json(await opsbotAnswer(user, text, ctx));
  } catch {
    return Response.json({ reply: 'Something went wrong while I looked that up. Please try again.' }, { status: 500 });
  }
}
