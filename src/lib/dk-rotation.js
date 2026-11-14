// The rotation of an incharge who moves between sites on a repeating pattern (for example Islamabad 3 days, Lahore 1, Okara 2, a travel day, APL 3 ...).
// Pure code (no database), so the pages, the forms and the checks all read it the same way.

export const DEFAULT_PATTERN = 'ISB 3, LHR 1, OKA 2, T 1, APL 3, T 1, OKA 1, LHR 2';

const norm = (c) => String(c || '').trim().toUpperCase();
const dayNum = (key) => Math.floor(Date.parse(key + 'T00:00:00Z') / 86400000);

/** "ISB 3, LHR 1, T 1" -> { steps: [{ site: 'ISB', days: 3 }, { site: 'T', days: 1 }], total, error }. T is a travel-only day. Sites must be in validSites (when given). */
export function parsePattern(text, validSites = null) {
  const steps = [];
  const parts = String(text || '').split(/[,\n;]+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { steps: [], total: 0, error: 'Write the pattern, for example: ISB 3, LHR 1, OKA 2, T 1' };
  const ok = validSites ? new Set(validSites.map(norm)) : null;
  for (const part of parts) {
    const m = part.match(/^([A-Za-z0-9]+)\s*[x:=\-]?\s*(\d{1,2})$/);
    if (!m) return { steps: [], total: 0, error: 'Cannot read "' + part + '". Use a site code and a number of days, like LHR 2.' };
    const site = norm(m[1]);
    const days = Number(m[2]);
    if (!(days >= 1 && days <= 31)) return { steps: [], total: 0, error: '"' + part + '": days must be 1 to 31' };
    if (site !== 'T' && ok && !ok.has(site)) return { steps: [], total: 0, error: site + ' is not on the Sites list (use T for a travel-only day)' };
    steps.push({ site, days });
  }
  return { steps, total: steps.reduce((a, x) => a + x.days, 0), error: '' };
}

export const patternText = (steps) => (steps || []).map((x) => x.site + ' ' + x.days).join(', ');

/** Where the rotation puts the person on a day: { site: 'LHR' } for a duty day, { site: 'T' } for a travel-only day, or null (before the start or no rotation). */
export function planFor(rot, day) {
  if (!rot || !rot.steps || !rot.steps.length || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
  const total = rot.steps.reduce((a, x) => a + x.days, 0);
  const n = dayNum(day) - dayNum(rot.start);
  if (!(total > 0) || n < 0) return null;
  let i = n % total;
  for (const s of rot.steps) {
    if (i < s.days) return { site: s.site };
    i -= s.days;
  }
  return null;
}

/** Planned duty days per site and travel-only days between two dates: { counts: { ISB: 6 }, travel: 4, days: 28 }. */
export function planCounts(rot, from, to) {
  const counts = {};
  let travel = 0;
  let days = 0;
  for (let n = dayNum(from); n <= dayNum(to); n++) {
    const key = new Date(n * 86400000).toISOString().slice(0, 10);
    const p = planFor(rot, key);
    if (!p) continue;
    days += 1;
    if (p.site === 'T') travel += 1;
    else counts[p.site] = (counts[p.site] || 0) + 1;
  }
  return { counts, travel, days };
}
