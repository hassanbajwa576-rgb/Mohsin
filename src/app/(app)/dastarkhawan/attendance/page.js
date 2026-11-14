import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can } from '@/lib/perms';
import { ATT_ROLES, todayKey } from '@/lib/att';
import { validMonth, shiftMonth, hkPeople, addDays, siteList } from '@/lib/roster';
import { sortSites, siteTag, comparePeople, matchSite } from '@/lib/dk-sites';
import { syncDk } from '@/lib/dk-sync';
import { dkDayRows, dkOvertime, DUTY_MIN, to24 } from '@/lib/dk-hours';
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
  const view = ['sites', 'ot'].includes(sp.v) ? sp.v : 'grid';

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
  const multi = team.filter((t) => (t.sites || []).length > 1 && (!who || t.id === who));
  const siteOpts = sortSites([...new Set(team.filter((t) => (t.sites || []).length > 1).flatMap((t) => t.sites.map((x) => x.site)))]);
  const siteStats = [...multi].sort((a, b) => comparePeople({ name: a.name, codes: a.sites.map((x) => x.site) }, { name: b.name, codes: b.sites.map((x) => x.site) })).map((t) => {
    const codes = sortSites(t.sites.map((x) => x.site));
    const counts = Object.fromEntries(codes.map((c) => [c, 0]));
    for (const [k, site] of Object.entries(siteDays)) if (k.startsWith(t.id + '|') && site in counts) counts[site] += 1;
    const present = rows.filter((r) => r.person_id === t.id);
    return { id: t.id, name: t.name, codes, counts, set: Object.values(counts).reduce((a, n) => a + n, 0), present: present.length, unset: present.filter((r) => !siteDays[t.id + '|' + r.day]).length };
  });

  const by = new Map();
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
    const over = done.reduce((a, d) => a + Math.max(0, d.mins - DUTY_MIN), 0);
    const short = done.reduce((a, d) => a + Math.max(0, DUTY_MIN - d.mins), 0);
    return { ...p, site: siteOf.get(p.id) || p.site, codes: codesOf.get(p.id) || [], present: p.days.length, counted: done.length, total, over, short, bank: ot.get(p.id) || { earned: 0, used: 0, left: 0, days: 0 } };
  });
  people.sort(comparePeople);
  // "Add time" / "Edit" on a row opens the form for that person and day, with the current times filled in.
  const hit = rows.find((r) => String(r.person_id) === String(sp.p) && r.day === sp.d);
  const fix = team.some((p) => String(p.id) === String(sp.p)) && /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '')
    ? { p: String(sp.p), d: sp.d, in: hit ? to24(hit.check_in) : '', out: hit ? to24(hit.check_out) : '', note: hit && hit.manual ? hit.note || '' : '', site: siteDays[sp.p + '|' + sp.d] || '' }
    : {};
  return <DkAttendanceView sp={sp} month={month} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} who={who} team={team} people={people} om={om} convert={convertOvertime} save={saveDkTime} clear={clearDkTime} fix={fix} today={today} view={view} from={from} to={to} custom={custom} dates={dates} siteDays={siteDays} siteOpts={siteOpts} siteStats={siteStats} multi={multi.map((t) => t.id)} />;
}
