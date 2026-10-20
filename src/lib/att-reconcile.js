import 'server-only';
import { q } from './db';
import { TZ, EV_COLS, KIND_LABEL, groupByStaff, sessionsOf, conflictIds, dateKey, fmtTime } from './att';

export const LONG_MS = 16 * 3600000;
const dur = (ms) => Math.floor(ms / 3600000) + 'h ' + String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0') + 'm';
export const markKey = (staff, day, kind, sig) => staff + '|' + day + '|' + kind + '|' + sig;

/** Items already marked as reviewed in the range, as a Set of markKey(...). */
export async function reviewedSet(from, to) {
  const rows = await q('SELECT staff_id, day, kind, sig FROM pc2_review_marks WHERE day >= $1 AND day <= $2', [from, to]);
  return new Set(rows.map((r) => markKey(r.staff_id, r.day, r.kind, r.sig)));
}

/**
 * Everything in the app between two dates that still needs a look and has not been marked as reviewed:
 * shifts over 16 hours, check ins with no check out, and entries that do not fit together.
 */
export async function scan(from, to) {
  const staff = await q('SELECT s.id, s.name, o.code AS office FROM pc2_staff s JOIN pc2_offices o ON o.id = s.office_id WHERE s.active ORDER BY o.code, s.name');
  const evs = await q(
    `SELECT ${EV_COLS} FROM pc2_attendance a WHERE a.at >= (($1::date - 1)::timestamp AT TIME ZONE '${TZ}') AND a.at < (($2::date + 2)::timestamp AT TIME ZONE '${TZ}') ORDER BY a.at, a.id`,
    [from, to]
  );
  const by = groupByStaff(evs);
  const bad = conflictIds(evs);
  const done = await reviewedSet(from, to);
  const out = { long: [], noout: [], misfit: [], hidden: 0 };
  const add = (list, it) => {
    if (done.has(markKey(it.staff, it.day, it.kind, it.sig))) out.hidden += 1;
    else list.push(it);
  };

  for (const s of staff) {
    const list = by.get(s.id) || [];
    for (const x of sessionsOf(list)) {
      const day = dateKey(x.start);
      if (day < from || day > to) continue;
      const base = { staff: s.id, name: s.name, office: s.office, day };
      if (x.end != null && !x.missed && x.end - x.start > LONG_MS) {
        add(out.long, { ...base, kind: 'long', sig: fmtTime(x.start) + '|' + fmtTime(x.end), text: 'In ' + fmtTime(x.start) + ', Out ' + fmtTime(x.end) + ' = ' + dur(x.end - x.start) });
      } else if (x.missed) {
        add(out.noout, { ...base, kind: 'noout', sig: fmtTime(x.start) + '|', text: 'Check in ' + fmtTime(x.start) + ', no check out' });
      }
    }
  }

  const names = new Map(staff.map((s) => [s.id, s]));
  const groups = new Map();
  for (const e of evs) {
    if (!bad.has(e.id) || !names.has(e.staff_id)) continue;
    const day = dateKey(e.ms);
    if (day < from || day > to) continue;
    const k = e.staff_id + '|' + day;
    if (!groups.has(k)) groups.set(k, { staff: e.staff_id, day, ids: [], parts: [] });
    const g = groups.get(k);
    g.ids.push(e.id);
    g.parts.push(KIND_LABEL[e.kind] + ' ' + fmtTime(e.ms));
  }
  for (const g of groups.values()) {
    const s = names.get(g.staff);
    add(out.misfit, { staff: g.staff, name: s.name, office: s.office, day: g.day, kind: 'misfit', sig: g.ids.sort((a, b) => a - b).join(','), text: g.parts.join(', ') });
  }
  for (const k of ['long', 'noout', 'misfit']) out[k].sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name));
  return out;
}
