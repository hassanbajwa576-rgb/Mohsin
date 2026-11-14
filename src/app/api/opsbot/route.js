import { getUser } from '@/lib/auth';
import { opsbotAnswer } from '@/lib/opsbot';
import { aiAnswer, aiEnabled, aiAllowed } from '@/lib/opsbot-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  const user = await getUser();
  if (!user || user.role === 'guard') return Response.json({ reply: 'Please sign in again.' }, { status: 401 });
  let text = '';
  let ctx = null;
  let history = [];
  try {
    const body = await req.json();
    text = String(body.text || '').slice(0, 300);
    ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : null;
    history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  } catch {
    return Response.json({ reply: 'I could not read that.' }, { status: 400 });
  }
  // With an API key, Claude answers (reading the app's records through read-only tools); on any problem the rule-based OpsBot answers instead.
  if (aiEnabled() && aiAllowed(user.id)) {
    try {
      const a = await aiAnswer(user, text, history);
      if (a && a.reply) return Response.json({ reply: a.reply, suggestions: [], ctx: null, ai: true });
    } catch {
      // fall through to the rule-based answer
    }
  }
  try {
    return Response.json(await opsbotAnswer(user, text, ctx));
  } catch {
    return Response.json({ reply: 'Something went wrong while I looked that up. Please try again.' }, { status: 500 });
  }
}
