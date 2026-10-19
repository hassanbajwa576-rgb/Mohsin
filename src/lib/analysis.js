import 'server-only';
import { q } from './db';
import {
  TZ, EV_COLS, SHIFT_COLS, SHIFT_JOIN, BREAK_LIMIT_MIN, sessionsOf, groupByStaff, dateKey, fmtTime, inClassFor, outClassFor, loadPeriods, shiftOn,
} from './att';

// Attendance analysis for a date range: per employee, per department, per shift and per break.
// Everything uses each person's own shift (or their department's) and the 30 minute grace period.

export const addDaysKey = (key, n) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mins = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (n) => {
  const x = ((Math.round(n) % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const weekStart = (key) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export const BUCKETS = [
  ['Under 15 min', 0, 15],
  ['15 - 30 min', 15, 30],
  ['30 - 60 min', 30, 60],
  ['Over 1 hour', 60, 1e9],
];

const pct = (a, b) => (b ? (a / b) * 100 : null);

// Roll people up into groups (department or shift) with weighted averages.
function roll(rows, keyOf, labelOf) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, { key: k, label: labelOf(r), people: 0, days: 0, expected: 0, shifts: 0, late: 0, early: 0, closedN: 0, workedSum: 0, breakSum: 0, over: 0, brkN: 0 });
    const g = m.get(k);
    g.people += 1;
    g.days += r.days;
    g.expected += r.expected;
    g.shifts += r.shifts;
    g.late += r.late;
    g.early += r.early;
    g.closedN += r.closedN;
    g.workedSum += r.workedSum;
    g.breakSum += r.breakSum;
    g.over += r.overShifts;
    g.brkN += r.breakCount;
  }
  return Array.from(m.values()).map((g) => ({
    ...g,
    attendancePct: pct(g.days, g.expected),
    onTimePct: g.shifts ? ((g.shifts - g.late) / g.shifts) * 100 : null,
    avgWorked: g.closedN ? g.workedSum / g.closedN : 0,
    avgBreak: g.closedN ? g.breakSum / g.closedN : 0,
  }));
}

export async function analyse({ from, to, office, depts }) {
  const cond = [];
  const params = [];
  if (office) {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (depts && depts.length) {
    params.push(depts);
    cond.push('s.dept = ANY($' + params.length + '::text[])');
  }
  const staff = await q(
    `SELECT s.id, s.code, s.name, s.dept, s.active, ${SHIFT_COLS}, o.code AS office FROM pc2_staff s ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = s.office_id ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY o.code, s.dept, s.name`,
    params
  );
  const none = { rows: [], byDept: [], byShift: [], breaks: { count: 0, avgMs: 0, longest: null, buckets: BUCKETS.map((b) => ({ label: b[0], n: 0 })), top: [] }, weeks: [], totals: { people: 0, attendancePct: null, onTimePct: null, avgWorked: 0, over: 0, shifts: 0 }, workDays: 0 };
  if (!staff.length) return none;

  const evs = await q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date - 1)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($3::date + 2)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [staff.map((s) => s.id), from, to]
  );
  const by = groupByStaff(evs);
  const periods = await loadPeriods(from, to);
  const limit = BREAK_LIMIT_MIN * 60000;

  // Days each office actually had check ins: the base for attendance %.
  const workDays = {};
  const people = staff.map((s) => {
    const sess = sessionsOf(by.get(s.id) || [])
      .map((x) => ({ ...x, date: dateKey(x.start), st: shiftOn(s, dateKey(x.start), periods) }))
      .filter((x) => x.date >= from && x.date <= to);
    for (const x of sess) {
      if (!workDays[s.office]) workDays[s.office] = new Set();
      workDays[s.office].add(x.date);
    }
    return { s, sess };
  });

  const allBreaks = [];
  const weeks = new Map();
  const rows = people
    .map(({ s, sess }) => {
      const days = new Set(sess.map((x) => x.date));
      const base = mins(s.shift_start || '09:30');
      const offs = sess.map((x) => {
        let d = (((mins(fmtTime(x.start)) - mins(x.st.shift_start || '09:30')) % 1440) + 1440) % 1440;
        if (d > 720) d -= 1440;
        return d;
      });
      const late = sess.filter((x) => inClassFor(fmtTime(x.start), x.st) === 't-bad').length;
      const closed = sess.filter((x) => x.end != null && !x.missed);
      const early = closed.filter((x) => outClassFor(fmtTime(x.end), x.st) === 't-bad').length;
      const brks = closed.flatMap((x) => x.breaks.map((ms) => ({ ms, date: x.date, name: s.name })));
      allBreaks.push(...brks);
      for (const x of sess) {
        const wk = weekStart(x.date);
        const w = weeks.get(wk) || { week: wk, shifts: 0, late: 0 };
        w.shifts += 1;
        if (inClassFor(fmtTime(x.start), x.st) === 't-bad') w.late += 1;
        weeks.set(wk, w);
      }
      const expected = workDays[s.office] ? workDays[s.office].size : 0;
      const workedSum = sum(closed.map((x) => x.workedMs));
      const breakSum = sum(closed.map((x) => x.breakMs));
      return {
        id: s.id, name: s.name, dept: s.dept, office: s.office, active: s.active,
        shift: s.shift, shift_start: s.shift_start, shift_end: s.shift_end, shift_src: s.shift_src,
        days: days.size, expected, shifts: sess.length,
        attendancePct: pct(days.size, expected),
        avgIn: sess.length ? hhmm(base + mean(offs)) : '',
        late, early, missed: sess.filter((x) => x.missed).length,
        onTimePct: sess.length ? ((sess.length - late) / sess.length) * 100 : null,
        closedN: closed.length, workedSum, breakSum,
        avgWorked: closed.length ? workedSum / closed.length : 0,
        avgBreak: closed.length ? breakSum / closed.length : 0,
        overShifts: closed.filter((x) => x.breakMs > limit).length,
        breakCount: brks.length,
        longest: brks.length ? Math.max(...brks.map((b) => b.ms)) : 0,
        sess,
      };
    })
    .filter((r) => r.active || r.shifts > 0);

  const shiftLabel = (k) => (k === 'morning' ? 'Morning' : k === 'evening' ? 'Evening' : k === 'night' ? 'Night' : 'No shift set');
  const byDept = roll(rows, (r) => r.dept || '-', (r) => r.dept || 'No department').sort((a, b) => a.label.localeCompare(b.label));
  const order = { morning: 0, evening: 1, night: 2, '': 3 };
  const byShift = roll(rows, (r) => r.shift || '', (r) => shiftLabel(r.shift)).sort((a, b) => order[a.key] - order[b.key]);

  const totalShifts = sum(rows.map((r) => r.shifts));
  const totalLate = sum(rows.map((r) => r.late));
  const closedN = sum(rows.map((r) => r.closedN));
  const maxDays = Math.max(0, ...Object.values(workDays).map((s) => s.size));
  const totals = {
    people: rows.length,
    attendancePct: pct(sum(rows.map((r) => r.days)), sum(rows.map((r) => r.expected))),
    onTimePct: totalShifts ? ((totalShifts - totalLate) / totalShifts) * 100 : null,
    avgWorked: closedN ? sum(rows.map((r) => r.workedSum)) / closedN : 0,
    over: sum(rows.map((r) => r.overShifts)),
    shifts: totalShifts,
  };

  const longest = allBreaks.length ? allBreaks.reduce((a, b) => (b.ms > a.ms ? b : a)) : null;
  const breaks = {
    count: allBreaks.length,
    avgMs: mean(allBreaks.map((b) => b.ms)),
    longest,
    over1h: allBreaks.filter((b) => b.ms > limit).length,
    buckets: BUCKETS.map(([label, lo, hi]) => ({ label, n: allBreaks.filter((b) => b.ms / 60000 >= lo && b.ms / 60000 < hi).length })),
    top: rows.filter((r) => r.overShifts > 0).sort((a, b) => b.overShifts - a.overShifts || b.avgBreak - a.avgBreak).slice(0, 8),
  };

  const weekList = Array.from(weeks.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((w) => ({ ...w, onTimePct: w.shifts ? ((w.shifts - w.late) / w.shifts) * 100 : null }));

  return { rows, byDept, byShift, breaks, weeks: weekList, totals, workDays: maxDays };
}
