import { runVisitorReminders } from '@/lib/visitor-reminders';

export const dynamic = 'force-dynamic';

// An outside pinger (every minute) calls this so reminders go out even when nobody has the app open.
// It only sends reminders that are due and have not been sent, so calling it often is safe.
export async function GET() {
  const r = await runVisitorReminders();
  return Response.json({ ok: true, ...r });
}
