import 'server-only';
import { q } from './db';
import { can } from './perms';

// OpsTrack: staff attendance (check in / out and breaks) for the LHR and ISB offices.

export const TZ = 'Asia/Karachi';

// An employee's shift is their own if set, otherwise their department's (use with SHIFT_JOIN after pc2_staff s).
export const SHIFT_JOIN = 'LEFT JOIN pc2_dept_shifts d ON d.dept = s.dept';
export const SHIFT_COLS =
  "CASE WHEN s.shift <> '' THEN s.shift ELSE COALESCE(d.shift, '') END AS shift, " +
  "CASE WHEN s.shift <> '' THEN s.shift_start ELSE COALESCE(d.shift_start, '') END AS shift_start, " +
  "CASE WHEN s.shift <> '' THEN s.shift_end ELSE COALESCE(d.shift_end, '') END AS shift_end, " +
  "CASE WHEN s.shift <> '' THEN 'own' WHEN d.shift IS NOT NULL THEN 'department' ELSE '' END AS shift_src";
export const BREAK_LIMIT_MIN = 60;
export const KIND_LABEL = { in: 'Check In', out: 'Check Out', break_out: 'Break Out', break_in: 'Break In' };
export const STATE_LABEL = { off: 'Off duty', on: 'On duty', break: 'On break' };
export const ATT_ROLES = ['om', 'sso', 'so', 'guard'];

// state machine: what each kind of entry is allowed to do from each state
const NEXT = {
  off: { in: 'on' },
  on: { break_out: 'break', out: 'off' },
  break: { break_in: 'on', out: 'off' },
};

// Only the Sr. Ops Manager and the Sr. SO may see the times of entries.
// Support Officers and guards are data-entry only: they can record, never read times back.
export const canSeeTimes = (u) => can(u, 'att_view');
// The Sr. OM and Sr. SO work across both offices; everyone else only in their own office.
export const allOffices = (u) => u.role === 'om' || u.role === 'sso';
export const canEnterFor = (u, officeId) => allOffices(u) || u.office_id === officeId;

const tfmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dfmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const fmtTime = (ms) => tfmt.format(new Date(Number(ms)));
export const dateKey = (ms) => dfmt.format(new Date(Number(ms)));
export const todayKey = () => dateKey(Date.now());

/** Report default day: the latest day before today that has any entries (yesterday on a normal weekday). */
export async function lastWorkDay(today) {
  const r = await q(
    `SELECT COALESCE(to_char(max(a.at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD'), to_char($1::date - 1, 'YYYY-MM-DD')) AS d FROM pc2_attendance a WHERE a.at < (($1::date)::timestamp AT TIME ZONE '${TZ}')`,
    [today]
  );
  return (r[0] && r[0].d) || today;
}

/** Break filter for report rows: 'normal' = a break of up to the limit, 'extended' = over it. Shifts with no break only show under all. */
export function breakFilter(rows, brk) {
  if (brk === 'normal') return rows.filter((r) => r.breaks > 0 && !r.over);
  if (brk === 'extended') return rows.filter((r) => r.over);
  return rows;
}
export const fmtDur = (ms) => {
  const m = Math.round(Math.max(0, ms) / 60000);
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
};
export const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
export const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** First event that breaks the in/break/out order, or null when the whole sequence is valid. */
export function firstBad(evs) {
  let s = 'off';
  for (let i = 0; i < evs.length; i++) {
    const n = NEXT[s][evs[i].kind];
    if (!n) return { i, state: s };
    s = n;
  }
  return null;
}

export function stateOf(evs) {
  let state = 'off';
  let since = null;
  for (const e of evs) {
    state = NEXT[state][e.kind] ?? state;
    since = Number(e.ms);
  }
  return { state, since };
}

export function sessionsOf(evs, now = Date.now()) {
  const out = [];
  let cur = null;
  for (const e of evs) {
    const ms = Number(e.ms);
    if (e.kind === 'in') {
      if (cur) out.push(cur);
      cur = { start: ms, end: null, breaks: [], open: null, office_id: e.office_id, xin: e.source === 'excel', xout: false };
    } else if (!cur) continue;
    else if (e.kind === 'break_out') cur.open = ms;
    else if (e.kind === 'break_in') {
      if (cur.open != null) { cur.breaks.push([cur.open, ms]); cur.open = null; }
    } else if (e.kind === 'out' && e.virtual) {
      // Never checked out and a new day started: the shift stays on record but counts no hours.
      cur.missed = true;
      cur.open = null;
      out.push(cur);
      cur = null;
    } else if (e.kind === 'out') {
      if (cur.open != null) { cur.breaks.push([cur.open, ms]); cur.open = null; }
      cur.end = ms;
      cur.xout = e.source === 'excel';
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => {
    const br = s.breaks.slice();
    // office_id = the office the person checked in at (a visiting employee counts there for that shift).
    // A check in from an earlier day with no check out is a missed check out, not a shift still running.
    const miss = !!s.missed || (s.end == null && dateKey(s.start) < dateKey(now));
    if (s.open != null && !miss) br.push([s.open, now]);
    const breakMs = br.reduce((a, b) => a + (b[1] - b[0]), 0);
    return { start: s.start, end: s.end, office_id: s.office_id, xin: s.xin, xout: s.xout, missed: miss, live: s.end == null && !miss, breakCount: br.length, breaks: br.map((b) => b[1] - b[0]), breakMs, workedMs: miss ? 0 : Math.max(0, (s.end ?? now) - s.start - breakMs) };
  });
}

export const EV_COLS = `a.id, a.staff_id, a.office_id, a.kind, a.entered_by, a.source, (extract(epoch from a.at) * 1000)::float8 AS ms, (extract(epoch from a.entered_at) * 1000)::float8 AS entered_ms`;

export function groupByStaff(events) {
  const m = new Map();
  for (const e of events) {
    if (!m.has(e.staff_id)) m.set(e.staff_id, []);
    m.get(e.staff_id).push(e);
  }
  // A check in left open from an earlier day is closed (as a missed check out) when a new check in follows.
  for (const [k, list] of m) m.set(k, closeStale(list));
  return m;
}

/** Active staff this user may record entries for (Sr. OM / Sr. SO: both offices; others: own office). */
export async function activeStaff(user) {
  const all = allOffices(user);
  return q(
    `SELECT s.id, s.code, s.name, s.dept, ${SHIFT_COLS}, s.office_id, o.code AS office FROM pc2_staff s ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ${all ? '' : 'AND s.office_id = $1'} ORDER BY o.code, s.name`,
    all ? [] : [user.office_id]
  );
}

/** All active staff (both offices): the entry form can record a visiting employee at the user's office. */
export async function entryStaff() {
  return q(`SELECT s.id, s.code, s.name, s.dept, ${SHIFT_COLS}, s.office_id, o.code AS office FROM pc2_staff s ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ORDER BY o.code, s.name`);
}

export async function recentEvents(staffIds, days = 3) {
  if (!staffIds.length) return [];
  return q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at > now() - ($2::int * interval '1 day') ORDER BY a.at, a.id`,
    [staffIds, days]
  );
}

export async function allEventsOf(staffId) {
  return q(`SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = $1 ORDER BY a.at, a.id`, [staffId]);
}

/** Duty contacts: morning / evening guards and the support team, per office. */
export async function dutyContacts(user) {
  const users = await q(
    `SELECT u.name, u.role, u.phone, u.shift, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.active ORDER BY u.name`
  );
  const offices = allOffices(user) ? ['LHR', 'ISB'] : [user.office_code];
  return offices.map((code) => {
    const here = users.filter((x) => x.office === code);
    const guards = (shift) => here.filter((x) => x.role === 'guard' && x.shift === shift);
    const team = users.filter((x) => (x.role === 'om' || x.role === 'sso') || (x.role === 'so' && x.office === code));
    return { office: code, morning: guards('morning'), evening: guards('evening'), team };
  });
}

/** Part of a name as an ILIKE pattern (wildcards typed by the user are ignored). */
export const nameLike = (w) => '%' + String(w).replace(/[\\%_]/g, '').trim().slice(0, 60) + '%';

/** Names of the active employees (one office, or both), for the employee search box. */
export async function staffNames(office) {
  const r = await q(`SELECT s.name FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ${office ? 'AND o.code = $1' : ''} ORDER BY s.name`, office ? [office] : []);
  return r.map((x) => x.name);
}

export const officeCodes = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.code]));

/** One row per shift (check in .. check out) between two dates (inclusive), Karachi time. */
export async function reportRows({ from, to, office, dept, who }) {
  const deptList = Array.isArray(dept) ? dept.filter(Boolean) : dept ? [dept] : [];
  const cond = [];
  const params = [];
  // An employee who checked in at the chosen office counts there for that shift, even when based in the other office.
  if (office) {
    params.push(office, from, to);
    const n = params.length;
    cond.push(`(o.code = $${n - 2} OR s.id IN (SELECT a.staff_id FROM pc2_attendance a JOIN pc2_offices ao ON ao.id = a.office_id WHERE ao.code = $${n - 2} AND a.at >= (($${n - 1}::date - 1)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($${n}::date + 2)::timestamp AT TIME ZONE '${TZ}')))`);
  }
  if (deptList.length) {
    params.push(deptList);
    cond.push('s.dept = ANY($' + params.length + '::text[])');
  }
  if (who) {
    params.push(nameLike(who));
    cond.push('s.name ILIKE $' + params.length);
  }
  const staff = await q(
    `SELECT s.id, s.code, s.name, s.dept, ${SHIFT_COLS}, o.code AS office FROM pc2_staff s ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = s.office_id ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY o.code, s.dept, s.name`,
    params
  );
  if (!staff.length) return [];
  const codeOf = officeCodes(await q('SELECT id, code FROM pc2_offices'));
  const evs = await q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date - 1)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($3::date + 2)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [staff.map((s) => s.id), from, to]
  );
  const by = groupByStaff(evs);
  const periods = await loadPeriods(from, to);
  const limit = BREAK_LIMIT_MIN * 60000;
  const rows = [];
  for (const s of staff) {
    for (const x of sessionsOf(by.get(s.id) || [])) {
      const d = dateKey(x.start);
      if (d < from || d > to) continue;
      const where = codeOf[x.office_id] || s.office;
      if (office && where !== office) continue;
      const st = shiftOn(s, d, periods);
      rows.push({
        date: d, office: where, dept: s.dept, shift: st.shift, shift_start: st.shift_start, shift_end: st.shift_end, shift_src: st.shift_src, name: s.name, code: s.code,
        inX: x.xin, outX: x.xout, in: fmtTime(x.start), out: x.end ? fmtTime(x.end) : x.missed ? (x.xin ? '(no check out)' : '(missed check out)') : '(on duty)',
        breaks: x.breakCount, breakMs: x.breakMs, workedMs: x.workedMs, over: x.breakMs > limit,
      });
    }
  }
  return rows.sort((a, b) => (a.date + a.in).localeCompare(b.date + b.in) || a.name.localeCompare(b.name));
}

/** Distinct department names (for the report filter). */
export async function departments() {
  const r = await q("SELECT DISTINCT dept FROM pc2_staff WHERE dept <> '' ORDER BY dept");
  return r.map((x) => x.dept);
}

// Punctuality (green = on time, red = late or early).
// Every shift gets a 30 minute grace period: check in up to 30 minutes after the shift start is green (the standard
// start is 09:30, so green until 10:00). Check out from 5 minutes before the shift end is green (17:55 for 6 pm).
export const LATE_AFTER = '09:30';
export const EARLY_BEFORE = '17:55';
export const SHIFT_GRACE_MIN = 30;
const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const fromMin = (n) => {
  const x = ((n % 1440) + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
};
const circ = (a, b) => (((a - b) % 1440) + 1440) % 1440;
export const LATE_LIMIT = fromMin(toMin(LATE_AFTER) + SHIFT_GRACE_MIN);
const timed = (st) => st && st.shift && st.shift !== 'morning' && st.shift_start;
export const inClassFor = (hhmm, st) => {
  if (timed(st)) {
    const d = circ(toMin(hhmm), toMin(st.shift_start));
    return d <= SHIFT_GRACE_MIN || d > 720 ? 't-ok' : 't-bad';
  }
  const lim = fromMin(toMin(st && st.shift === 'morning' && st.shift_start ? st.shift_start : LATE_AFTER) + SHIFT_GRACE_MIN);
  return hhmm <= lim ? 't-ok' : 't-bad';
};
export const outClassFor = (hhmm, st) => {
  if (st && st.shift && st.shift !== 'morning' && st.shift_end) {
    return circ(toMin(hhmm), toMin(st.shift_end) - 5) <= 720 ? 't-ok' : 't-bad';
  }
  const lim = st && st.shift === 'morning' && st.shift_end ? fromMin(toMin(st.shift_end) - 5) : EARLY_BEFORE;
  return hhmm >= lim ? 't-ok' : 't-bad';
};
export const inClass = (hhmm) => inClassFor(hhmm, null);
export const outClass = (hhmm) => outClassFor(hhmm, null);
export const timeClass = (kind, hhmm, st) => (kind === 'in' ? inClassFor(hhmm, st) : kind === 'out' ? outClassFor(hhmm, st) : '');

/** Temporary hours that touch a date range (loaded once, then resolved per person and day with shiftOn). */
export async function loadPeriods(from, to) {
  return q(
    `SELECT id, scope, dept, staff_id, shift_start, shift_end, to_char(from_date, 'YYYY-MM-DD') AS from_date, to_char(to_date, 'YYYY-MM-DD') AS to_date, note FROM pc2_shift_periods WHERE from_date <= $2::date AND to_date >= $1::date`,
    [from, to]
  );
}

/**
 * The hours that applied to one person on one day. Temporary hours win over the normal shift: a period for the
 * employee beats one for their department, which beats one for everyone; at the same level the latest saved wins.
 */
export function shiftOn(st, day, periods) {
  const sid = st.staff_id ?? st.id;
  const rank = (p) => (p.scope === 'employee' ? 3 : p.scope === 'department' ? 2 : 1);
  const hit = (periods || [])
    .filter((p) => p.from_date <= day && p.to_date >= day && (p.scope === 'everyone' || (p.scope === 'department' && p.dept === st.dept) || (p.scope === 'employee' && p.staff_id === sid)))
    .sort((a, b) => rank(b) - rank(a) || b.id - a.id)[0];
  if (!hit) return st;
  return { ...st, shift: 'custom', shift_start: hit.shift_start, shift_end: hit.shift_end, shift_src: 'temporary', temp_to: hit.to_date, temp_note: hit.note };
}
/** Short text for an employee's shift, e.g. "Morning 9:30 AM - 6:00 PM". */
export const shiftText = (st) => {
  if (!st || !st.shift) return '-';
  const name = st.shift === 'custom' ? 'Temporary' : st.shift.charAt(0).toUpperCase() + st.shift.slice(1);
  return st.shift_start && st.shift_end ? name + ' ' + to12(st.shift_start) + ' - ' + to12(st.shift_end) : name + ' (times not set)';
};

/** Ids of entries that contradict the entries around them (shown red so someone fixes them). */
export function conflictIds(evs) {
  const bad = new Set();
  for (const list of groupByStaff(evs).values()) {
    const sorted = list.slice().sort((a, b) => Number(a.ms) - Number(b.ms) || a.id - b.id);
    let s = 'off';
    let openBreak = null;
    for (const e of sorted) {
      if (e.virtual) {
        s = 'off';
        openBreak = null;
        continue;
      }
      const n = NEXT[s][e.kind];
      if (!n) {
        bad.add(e.id);
        continue;
      }
      if (e.kind === 'out' && s === 'break') {
        bad.add(e.id);
        if (openBreak != null) bad.add(openBreak);
      }
      openBreak = e.kind === 'break_out' ? e.id : null;
      s = n;
    }
  }
  return bad;
}

/** Entries from the last 36 hours that this user may still change. */
export async function editableEntries(user) {
  const cond = user.role === 'om' ? '' : user.role === 'sso' ? "AND (a.entered_by = $1 OR ub.role IN ('so', 'guard'))" : 'AND a.entered_by = $1';
  return q(
    `SELECT a.id, a.staff_id, a.kind, a.entered_by, a.source, s.name, s.dept, ${SHIFT_COLS}, o.code AS office, ub.name AS by_name, (extract(epoch from a.at) * 1000)::float8 AS ms, (a.entered_at > now() - interval '30 minutes') AS fresh FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = a.office_id LEFT JOIN pc2_users ub ON ub.id = a.entered_by WHERE a.entered_at > now() - interval '36 hours' ${cond} ORDER BY a.at DESC, a.id DESC LIMIT 60`,
    user.role === 'om' ? [] : [user.id]
  );
}

/** Entries around one day (the day before and after too), for spotting contradictions. */
export async function eventsAround(staffIds, day) {
  if (!staffIds.length) return [];
  return q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date - 1)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($2::date + 2)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [staffIds, day]
  );
}

/** Active staff and their entries for one day (Karachi time). */
export async function dayBoard(day, office) {
  // Everyone active, then each person is placed in the office they checked in at that day (their own office otherwise).
  const all = await q(
    `SELECT s.id, s.name, s.dept, ${SHIFT_COLS}, o.code AS office FROM pc2_staff s ${SHIFT_JOIN} JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ORDER BY o.code, s.name`
  );
  if (!all.length) return { staff: [], by: new Map() };
  const evs = await q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [all.map((x) => x.id), day]
  );
  const codeOf = officeCodes(await q('SELECT id, code FROM pc2_offices'));
  const first = new Map();
  for (const e of evs) if (!first.has(e.staff_id)) first.set(e.staff_id, e.office_id);
  const staff = all
    .map((x) => ({ ...x, home: x.office, office: first.has(x.id) ? codeOf[first.get(x.id)] || x.office : x.office }))
    .filter((x) => !office || x.office === office);
  const keep = new Set(staff.map((x) => x.id));
  return { staff, by: groupByStaff(evs.filter((e) => keep.has(e.staff_id))) };
}

/** People who checked in on each of the 7 days ending on the given day. */
export async function trend(day, office) {
  return q(
    `SELECT to_char(a.at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS d, COUNT(DISTINCT a.staff_id)::int AS n FROM pc2_attendance a JOIN pc2_offices o ON o.id = a.office_id WHERE a.kind = 'in' AND a.at >= (($1::date - 6)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($1::date + 1)::timestamp AT TIME ZONE '${TZ}') ${office ? 'AND o.code = $2' : ''} GROUP BY 1 ORDER BY 1`,
    office ? [day, office] : [day]
  );
}

// 12-hour display (am / pm). Comparisons for punctuality still use the 24-hour HH:MM text.
export const to12 = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
};
export const fmt12 = (ms) => to12(fmtTime(ms));
const dayfmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
export const fmtDay = (ms) => dayfmt.format(new Date(Number(ms)));

/**
 * While people are new to the system, a check in that was never closed does not block the next day:
 * when a new check in arrives on a later day, the old shift is closed as a missed check out.
 */
export function closeStale(evs) {
  const sorted = evs.slice().sort((a, b) => Number(a.ms) - Number(b.ms) || a.id - b.id);
  const out = [];
  let s = 'off';
  let last = null;
  for (const e of sorted) {
    if (e.kind === 'in' && s !== 'off' && last && dateKey(last.ms) < dateKey(e.ms)) {
      out.push({ id: -1 - out.length, staff_id: last.staff_id, office_id: last.office_id, kind: 'out', ms: Number(last.ms) + 1, virtual: true });
      s = 'off';
    }
    out.push(e);
    s = NEXT[s][e.kind] ?? s;
    last = e;
  }
  return out;
}
