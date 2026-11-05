import { runTaskReminders } from '@/lib/task-reminders';

export const dynamic = 'force-dynamic';

// Called by the same outside pinger as the visitor reminders. It sends at most one reminder per person per day.
export async function GET() {
  const r = await runTaskReminders();
  return Response.json({ ok: true, ...r });
}
