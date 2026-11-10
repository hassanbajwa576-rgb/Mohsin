import { runTaskReminders } from '@/lib/task-reminders';
import { runRoutines } from '@/lib/task-rules';
import { runReminders } from '@/lib/reminders';
import { applyStaffDates } from '@/lib/staff-dates';

export const dynamic = 'force-dynamic';

// Called by the same outside pinger as the visitor reminders. Each part sends at most once per person per day.
export async function GET() {
  const tasks = await runTaskReminders();
  const routines = await runRoutines();
  const reminders = await runReminders();
  await applyStaffDates();
  return Response.json({ ok: true, tasks, routines, reminders });
}
