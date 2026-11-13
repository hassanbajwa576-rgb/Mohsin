import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { validMonth, shiftMonth, hkPeople, addDays } from '@/lib/roster';
import { syncDk } from '@/lib/dk-sync';
import { dkDayRows, dkOvertime, DUTY_MIN, to24 } from '@/lib/dk-hours';
import { convertOvertime, saveDkTime, clearDkTime } from '@/lib/roster-actions';
import DkAttendanceView from '@/components/DkAttendanceView';

export const dynamic = 'force-dynamic';

// Dastarkhawan attendance: check in, check out and duty time per day (red under 8 hours, green from 8), monthly totals and overtime that can be converted to PTO.
export default async function DastarkhawanAttendance({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const sp = await searchParams;
  const today = todayKey();
  const month = validMonth(sp.m) ? sp.m : today.slice(0, 7);
  const from = month + '-01';
  const to = addDays(shiftMonth(month, 1) + '-01', -1);
  await syncDk();
  const team = await hkPeople({ team: 'dast' });
  const who = team.some((p) => String(p.id) === String(sp.who)) ? Number(sp.who) : 0;
  const rows = await dkDayRows(from, to, who);
  const ot = await dkOvertime();
  const om = user.role === 'om';

  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.person_id)) by.set(r.person_id, { id: r.person_id, name: r.name, site: r.site || '', days: [] });
    by.get(r.person_id).days.push(r);
  }
  const people = [...by.values()].map((p) => {
    const done = p.days.filter((d) => d.mins != null);
    const total = done.reduce((a, d) => a + d.mins, 0);
    const over = done.reduce((a, d) => a + Math.max(0, d.mins - DUTY_MIN), 0);
    const short = done.reduce((a, d) => a + Math.max(0, DUTY_MIN - d.mins), 0);
    return { ...p, present: p.days.length, counted: done.length, total, over, short, bank: ot.get(p.id) || { earned: 0, used: 0, left: 0, days: 0 } };
  });
  // "Add time" / "Edit" on a row opens the form for that person and day, with the current times filled in.
  const hit = rows.find((r) => String(r.person_id) === String(sp.p) && r.day === sp.d);
  const fix = team.some((p) => String(p.id) === String(sp.p)) && /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '')
    ? { p: String(sp.p), d: sp.d, in: hit ? to24(hit.check_in) : '', out: hit ? to24(hit.check_out) : '', note: hit && hit.manual ? hit.note || '' : '' }
    : {};
  return <DkAttendanceView sp={sp} month={month} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} who={who} team={team} people={people} om={om} convert={convertOvertime} save={saveDkTime} clear={clearDkTime} fix={fix} today={today} />;
}
