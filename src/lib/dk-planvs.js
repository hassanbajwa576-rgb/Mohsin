import 'server-only';
import { q } from './db';
import { monthOff, siteList, addDays, TLABEL } from './roster';
import { dkDayRows } from './dk-hours';
import { matchSite } from './dk-sites';
import { planFor } from './dk-rotation';

/** An incharge's rotation against what happened, one entry per day from..to: { day, plan ('' | site | 'T'), site (actual), in, out, mins, res, leave }.
 *  res: ok, diff (another site), unknown (checked in, site not known), miss (planned duty day, no check-in), pending (today, not in yet), future,
 *  travel, travel_in, leave, extra (checked in with no plan). today is not counted by summarize() until it is over. */
export async function dkPlanVsActual(pid, rot, from, to, today) {
  const rows = await dkDayRows(from, to, pid);
  const known = await siteList();
  const act = {};
  for (const x of await q(`SELECT to_char(day, 'YYYY-MM-DD') AS day, site FROM pc2_dk_sitedays WHERE person_id = $1 AND day >= $2::date AND day <= $3::date`, [pid, from, to])) act[x.day] = x.site;
  for (const r of rows) if (!act[r.day]) { const a = matchSite(r.app_site, known); if (a) act[r.day] = a; }
  const leave = {};
  for (const o of await monthOff({ from, to, team: 'dast', who: '' })) {
    if (o.staff_id !== pid) continue;
    for (let d = o.from_date < from ? from : o.from_date; d <= o.to_date && d <= to; d = addDays(d, 1)) if (!leave[d]) leave[d] = { label: TLABEL[o.kind] || o.kind, hours: o.hours };
  }
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const pf = planFor(rot, day);
    const plan = pf ? pf.site : '';
    const r = byDay.get(day);
    const lv = leave[day];
    const site = act[day] || '';
    let res = '';
    if (lv && lv.hours == null) res = 'leave';
    else if (plan === 'T') res = r ? 'travel_in' : 'travel';
    else if (plan) res = r ? (site ? (site === plan ? 'ok' : 'diff') : 'unknown') : day > today ? 'future' : day === today ? 'pending' : 'miss';
    else res = r ? 'extra' : '';
    days.push({ day, plan, site, in: r ? r.check_in : '', out: r ? r.check_out : '', mins: r ? r.mins : null, res, leave: lv ? lv.label : '' });
  }
  return days;
}

/** Counts over the days before today: as planned, other site, no check-in, site not known, plus planned and actual days per site. */
export function summarize(days, today) {
  const past = days.filter((d) => d.day < today);
  const n = (res) => past.filter((d) => d.res === res).length;
  const planned = {};
  const actual = {};
  for (const d of past) {
    if (d.plan && d.plan !== 'T') planned[d.plan] = (planned[d.plan] || 0) + 1;
    if (d.plan && d.plan !== 'T' && d.in && d.site) actual[d.site] = (actual[d.site] || 0) + 1;
  }
  return { ok: n('ok'), diff: n('diff'), miss: n('miss'), unknown: n('unknown'), travelIn: n('travel_in'), leave: n('leave'), planned, actual, days: past.length };
}
