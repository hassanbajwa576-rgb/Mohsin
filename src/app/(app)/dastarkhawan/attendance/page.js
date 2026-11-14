import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { planFor, planCounts } from '@/lib/dk-rotation';
import { dkRotations, monthOff, TLABEL, validMonth, shiftMonth, hkPeople, addDays, siteList } from '@/lib/roster';
import { sortSites, siteTag, comparePeople, matchSite } from '@/lib/dk-sites';
import { syncDk } from '@/lib/dk-sync';
import { dkDayRows, dkOvertime, dkDutyMap, to24 } from '@/lib/dk-hours';
import { q } from '@/lib/db';
import { convertOvertime, saveDkTime, clearDkTime } from '@/lib/roster-actions';
import DkAttendanceView from '@/components/DkAttendanceView';

export const dynamic = 'force-dynamic';

const isDayStr = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d));

// Dastarkhawan attendance: check in, check out and duty time per day (red under 8 hours, green from 8), monthly totals and overtime that can be converted to PTO.
export default async function DastarkhawanAttendance({ searchParams }) {
  const user = await requireUser(ATT_ROLES);
  if (!['om', 'sso', 'so'].includes(user.role) || !can(user, 'dast_edit')) redirect('/');
  const sp = await searchParams;
  const today = todayKey();
  const monthParam = validMonth(sp.m) ? sp.m : today.slice(0, 7);
  const month = isDayStr(sp.from) && isDayStr(sp.to) ? (sp.from <= sp.to ? sp.from : sp.to).slice(0, 7) : monthParam;
  let from = month + '-01';
  let to = addDays(shiftMonth(month, 1) + '-01', -1);
  // Custom dates (From / To) replace the month; at most about three months, so the grid stays readable.
  const custom = isDayStr(sp.from) && isDayStr(sp.to);
  if (custom) {
    let f = sp.from;
    let t = sp.to;
    if (t < f) [f, t] = [t, f];
    if (t > addDays(f, 91)) t = addDays(f, 91);
    from = f;
    to = t;
  }
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  await syncDk();
  const team = await hkPeople({ team: 'dast' });
  const who = team.some((p) => String(p.id) === String(sp.who)) ? Number(sp.who) : 0;
  const rows = await dkDayRows(from, to, who);
  const ot = await dkOvertime();
  const om = user.role === 'om';
  const view = ['sites', 'ot', 'plan'].includes(sp.v) ? sp.v : 'grid';

  // Incharges (people mapped to several sites) pick the site they spent each day at; days per site are counted from that.
  const sd = await q(`SELECT person_id, to_char(day, 'YYYY-MM-DD') AS day, site FROM pc2_dk_sitedays WHERE day >= $1::date AND day <= $2::date AND ($3::int = 0 OR person_id = $3::int)`, [from, to, who]);
  const siteDays = Object.fromEntries(sd.map((x) => [x.person_id + '|' + x.day, x.site]));
  // A day with no hand-picked site takes the site the facial app sent with that check-in (when it sends one).
  const knownSites = await siteList();
  for (const r of rows) {
    const k = r.person_id + '|' + r.day;
    const auto = matchSite(r.app_site, knownSites);
    if (!siteDays[k] && auto) siteDays[k] = auto;
  }
  // Where the rotation puts each incharge on each day of the range (only people who have a rotation).
  const rots = await dkRotations();
  const plan = {};
  for (const t of team) {
    const r = rots.get(t.id);
    if (r) for (const d of dates) { const pf = planFor(r, d); if (pf) plan[t.id + '|' + d] = pf.site; }
  }
  const multi = team.filter((t) => (t.sites || []).length > 1 && (!who || t.id === who));
  const siteOpts = sortSites([...new Set(team.filter((t) => (t.sites || []).length > 1).flatMap((t) => t.sites.map((x) => x.site)))]);
  const siteStats = [...multi].sort((a, b) => comparePeople({ name: a.name, codes: a.sites.map((x) => x.site) }, { name: b.name, codes: b.sites.map((x) => x.site) })).map((t) => {
    const codes = sortSites(t.sites.map((x) => x.site));
    const counts = Object.fromEntries(codes.map((c) => [c, 0]));
    for (const [k, site] of Object.entries(siteDays)) if (k.startsWith(t.id + '|') && site in counts) counts[site] += 1;
    const present = rows.filter((r) => r.person_id === t.id);
    const pc = rots.has(t.id) ? planCounts(rots.get(t.id), from, to) : null;
    return { id: t.id, name: t.name, plan: pc, codes, counts, set: Object.values(counts).reduce((a, n) => a + n, 0), present: present.length, unset: present.filter((r) => !siteDays[t.id + '|' + r.day]).length };
  });

  // Approved time-off in the range: each day of it shows as Leave in the grid, so a person off that day is not read as absent.
  const offRows = await monthOff({ from, to, team: 'dast', who: '' });
  const leaveDays = {};
  const leaveCount = {};
  for (const o of offRows) {
    if (who && o.staff_id !== who) continue;
    for (let d = o.from_date < from ? from : o.from_date; d <= o.to_date && d <= to; d = addDays(d, 1)) {
      const k = o.staff_id + '|' + d;
      if (!leaveDays[k]) { leaveDays[k] = { label: TLABEL[o.kind] || o.kind, hours: o.hours }; if (o.hours == null) leaveCount[o.staff_id] = (leaveCount[o.staff_id] || 0) + 1; }
    }
  }
  const by = new Map();
  // People off in this range show even when they have no check-in.
  for (const t of team) if (leaveCount[t.id] && (!who || t.id === who)) by.set(t.id, { id: t.id, name: t.name, site: '', days: [] });
  for (const r of rows) {
    if (!by.has(r.person_id)) by.set(r.person_id, { id: r.person_id, name: r.name, site: r.site || '', days: [] });
    by.get(r.person_id).days.push(r);
  }
  // Short site codes (APL, LHR...) as set on the Sites tab, instead of the facial app's own site text.
  const allSites = await siteList();
  const codesOf = new Map(team.map((t) => [t.id, (t.sites || []).map((x) => x.site)]));
  const siteOf = new Map(team.map((t) => [t.id, siteTag(codesOf.get(t.id), allSites)]));
  const people = [...by.values()].map((p) => {
    const done = p.days.filter((d) => d.mins != null);
    const total = done.reduce((a, d) => a + d.mins, 0);
    const over = done.reduce((a, d) => a + Math.max(0, d.mins - d.duty), 0);
    const short = done.reduce((a, d) => a + Math.max(0, d.duty - d.mins), 0);
    return { ...p, site: siteOf.get(p.id) || p.site, codes: codesOf.get(p.id) || [], present: p.days.length, counted: done.length, total, over, short, bank: ot.get(p.id) || { earned: 0, used: 0, left: 0, days: 0 } };
  });
  people.sort(comparePeople);
  // "Add time" / "Edit" on a row opens the form for that person and day, with the current times filled in.
  const hit = rows.find((r) => String(r.person_id) === String(sp.p) && r.day === sp.d);
  const fix = team.some((p) => String(p.id) === String(sp.p)) && /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '')
    ? { p: String(sp.p), d: sp.d, in: hit ? to24(hit.check_in) : '', out: hit ? to24(hit.check_out) : '', note: hit && hit.manual ? hit.note || '' : '', site: siteDays[sp.p + '|' + sp.d] || '' }
    : {};
  // "Plan vs actual": for one incharge with a rotation, each day of the range with what the rotation planned and what happened.
  let planView = null;
  const rotTeam = team.filter((t) => rots.has(t.id));
  if (view === 'plan' && rotTeam.length) {
    const pid = rotTeam.some((t) => t.id === who) ? who : rotTeam[0].id;
    const person = team.find((t) => t.id === pid);
    const rot = rots.get(pid);
    const prow = await dkDayRows(from, to, pid);
    const dutyMin = (await dkDutyMap()).get(pid) || 480;
    const act = {};
    for (const x of await q(`SELECT to_char(day, 'YYYY-MM-DD') AS day, site FROM pc2_dk_sitedays WHERE person_id = $1 AND day >= $2::date AND day <= $3::date`, [pid, from, to])) act[x.day] = x.site;
    for (const r of prow) if (!act[r.day]) { const a = matchSite(r.app_site, knownSites); if (a) act[r.day] = a; }
    const leaveP = {};
    for (const o of offRows) {
      if (o.staff_id !== pid) continue;
      for (let d = o.from_date < from ? from : o.from_date; d <= o.to_date && d <= to; d = addDays(d, 1)) if (!leaveP[d]) leaveP[d] = { label: TLABEL[o.kind] || o.kind, hours: o.hours };
    }
    const byDay = new Map(prow.map((r) => [r.day, r]));
    const days = dates.map((day) => {
      const pf = planFor(rot, day);
      const plan = pf ? pf.site : '';
      const r = byDay.get(day);
      const lv = leaveP[day];
      const site = act[day] || '';
      let res = '';
      if (lv && lv.hours == null) res = 'leave';
      else if (plan === 'T') res = r ? 'travel_in' : 'travel';
      else if (plan) res = r ? (site ? (site === plan ? 'ok' : 'diff') : 'unknown') : day > today ? 'future' : day === today ? 'pending' : 'miss';
      else res = r ? 'extra' : '';
      return { day, plan, site, in: r ? r.check_in : '', out: r ? r.check_out : '', mins: r ? r.mins : null, manual: !!(r && r.manual), res, leave: lv ? lv.label : '' };
    });
    const past = days.filter((d) => d.day < today); // today is not counted until the day is over
    const sites = [...new Set(rot.steps.map((x) => x.site).filter((x) => x !== 'T'))];
    const lastPast = addDays(today, -1);
    const sofar = lastPast < from ? { counts: {}, travel: 0, days: 0 } : planCounts(rot, from, lastPast < to ? lastPast : to);
    planView = {
      id: pid, name: person ? person.name : '', start: rot.start, pattern: rot.pattern, dutyMin, days, sites,
      planned: planCounts(rot, from, to), sofar,
      actual: Object.fromEntries(sites.map((c) => [c, past.filter((d) => d.plan && d.plan !== 'T' && d.site === c && d.in).length])),
      ok: past.filter((d) => d.res === 'ok').length, diff: past.filter((d) => d.res === 'diff').length, miss: past.filter((d) => d.res === 'miss').length,
      unknown: past.filter((d) => d.res === 'unknown').length, travelIn: past.filter((d) => d.res === 'travel_in').length,
      hours: past.reduce((a, d) => a + (d.mins || 0), 0), hoursPlanned: sofar.days ? (sofar.days - sofar.travel) * dutyMin : 0,
      options: rotTeam.map((t) => ({ id: t.id, name: t.name })),
    };
  }
  return <DkAttendanceView planView={planView} hasPlan={rotTeam.length > 0} plan={plan} leaveDays={leaveDays} leaveCount={leaveCount} canAll={user.role === 'om'} sp={sp} month={month} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} who={who} team={team} people={people} om={om} convert={convertOvertime} save={saveDkTime} clear={clearDkTime} fix={fix} today={today} view={view} from={from} to={to} custom={custom} dates={dates} siteDays={siteDays} siteOpts={siteOpts} siteStats={siteStats} multi={multi.map((t) => t.id)} />;
}
