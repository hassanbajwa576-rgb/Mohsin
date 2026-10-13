import 'server-only';
import { q } from './db';
import { can } from './perms';

// OpsTrack: staff attendance (check in / out and breaks) for the LHR and ISB offices.

export const TZ = 'Asia/Karachi';
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
      cur = { start: ms, end: null, breaks: [], open: null };
    } else if (!cur) continue;
    else if (e.kind === 'break_out') cur.open = ms;
    else if (e.kind === 'break_in') {
      if (cur.open != null) { cur.breaks.push([cur.open, ms]); cur.open = null; }
    } else if (e.kind === 'out') {
      if (cur.open != null) { cur.breaks.push([cur.open, ms]); cur.open = null; }
      cur.end = ms;
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => {
    const br = s.breaks.slice();
    if (s.open != null) br.push([s.open, now]);
    const breakMs = br.reduce((a, b) => a + (b[1] - b[0]), 0);
    return { start: s.start, end: s.end, live: s.end == null, breakCount: br.length, breakMs, workedMs: Math.max(0, (s.end ?? now) - s.start - breakMs) };
  });
}

const EV_COLS = `a.id, a.staff_id, a.office_id, a.kind, a.entered_by, (extract(epoch from a.at) * 1000)::float8 AS ms, (extract(epoch from a.entered_at) * 1000)::float8 AS entered_ms`;

export function groupByStaff(events) {
  const m = new Map();
  for (const e of events) {
    if (!m.has(e.staff_id)) m.set(e.staff_id, []);
    m.get(e.staff_id).push(e);
  }
  return m;
}

/** Active staff this user may record entries for (Sr. OM / Sr. SO: both offices; others: own office). */
export async function activeStaff(user) {
  const all = allOffices(user);
  return q(
    `SELECT s.id, s.code, s.name, s.dept, s.office_id, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ${all ? '' : 'AND s.office_id = $1'} ORDER BY o.code, s.name`,
    all ? [] : [user.office_id]
  );
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

/** One row per shift (check in .. check out) between two dates (inclusive), Karachi time. */
export async function reportRows({ from, to, office, dept }) {
  const cond = [];
  const params = [];
  if (office) {
    params.push(office);
    cond.push('o.code = $' + params.length);
  }
  if (dept) {
    params.push(dept);
    cond.push('s.dept = $' + params.length);
  }
  const staff = await q(
    `SELECT s.id, s.code, s.name, s.dept, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY o.code, s.dept, s.name`,
    params
  );
  if (!staff.length) return [];
  const evs = await q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date - 1)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($3::date + 2)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [staff.map((s) => s.id), from, to]
  );
  const by = groupByStaff(evs);
  const limit = BREAK_LIMIT_MIN * 60000;
  const rows = [];
  for (const s of staff) {
    for (const x of sessionsOf(by.get(s.id) || [])) {
      const d = dateKey(x.start);
      if (d < from || d > to) continue;
      rows.push({
        date: d, office: s.office, dept: s.dept, name: s.name, code: s.code,
        in: fmtTime(x.start), out: x.end ? fmtTime(x.end) : '(on duty)',
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

// Punctuality: checking in by 09:30 and checking out from 17:55 is on time (green), otherwise red.
export const LATE_AFTER = '09:30';
export const EARLY_BEFORE = '17:55';
export const inClass = (hhmm) => (hhmm <= LATE_AFTER ? 't-ok' : 't-bad');
export const outClass = (hhmm) => (hhmm >= EARLY_BEFORE ? 't-ok' : 't-bad');
export const timeClass = (kind, hhmm) => (kind === 'in' ? inClass(hhmm) : kind === 'out' ? outClass(hhmm) : '');

/** Ids of entries that contradict the entries around them (shown red so someone fixes them). */
export function conflictIds(evs) {
  const bad = new Set();
  for (const list of groupByStaff(evs).values()) {
    const sorted = list.slice().sort((a, b) => Number(a.ms) - Number(b.ms) || a.id - b.id);
    let s = 'off';
    let openBreak = null;
    for (const e of sorted) {
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
    `SELECT a.id, a.staff_id, a.kind, a.entered_by, s.name, o.code AS office, ub.name AS by_name, (extract(epoch from a.at) * 1000)::float8 AS ms, (a.entered_at > now() - interval '30 minutes') AS fresh FROM pc2_attendance a JOIN pc2_staff s ON s.id = a.staff_id JOIN pc2_offices o ON o.id = a.office_id LEFT JOIN pc2_users ub ON ub.id = a.entered_by WHERE a.entered_at > now() - interval '36 hours' ${cond} ORDER BY a.at DESC, a.id DESC LIMIT 60`,
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
  const staff = await q(
    `SELECT s.id, s.name, s.dept, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ${office ? 'AND o.code = $1' : ''} ORDER BY o.code, s.name`,
    office ? [office] : []
  );
  if (!staff.length) return { staff, by: new Map() };
  const evs = await q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.staff_id = ANY($1::int[]) AND a.at >= (($2::date)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [staff.map((x) => x.id), day]
  );
  return { staff, by: groupByStaff(evs) };
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
