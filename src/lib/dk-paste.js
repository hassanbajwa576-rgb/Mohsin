// Reading monthly figures pasted from a spreadsheet, a message or typed by hand: "Name 4 4 3 0 4". Used by the preview in the browser and
// by the server when saving, so both always read the text the same way. No server-only code here.

export const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MON_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthOf = (t) => {
  const w = String(t).toLowerCase();
  if (!/^[a-z]+$/.test(w) || w.length < 3) return 0;
  const i = MON.indexOf(w.slice(0, 3));
  return i >= 0 ? i + 1 : 0;
};
const isNum = (t) => /^\d+(\.\d+)?$/.test(t);
const isDash = (t) => /^[-–—]+$/.test(t);
const PREFIX = /^(muhammad|mohammad|mohammed|muhammed|mohd|md|m)$/;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter((w) => w.length >= 2 && !PREFIX.test(w));

/** Lines of "Name n n n" (tabs, commas or spaces between). An optional first line of month names (Jan Feb Mar) says which months the numbers belong to;
 *  otherwise the first number goes to fromMonth and the rest follow. A dash means nothing for that month.
 *  Returns { rows: [{ name, cells: [{ month, days }] }], warnings: [] }. */
export function parseFigures(text, fromMonth = 1) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const warnings = [];
  const rows = [];
  let months = null;
  lines.forEach((line, idx) => {
    const tokens = line.replace(/[\t,;|:]+/g, ' ').split(/\s+/).filter(Boolean);
    const body = tokens.filter((t) => !/^(name|team|member|staff)$/i.test(t));
    if (idx === 0 && body.length && body.every((t) => monthOf(t))) { months = body.map(monthOf); return; }
    let end = tokens.length;
    while (end > 0 && (isNum(tokens[end - 1]) || isDash(tokens[end - 1]))) end--;
    const name = tokens.slice(0, end).join(' ');
    const vals = tokens.slice(end);
    if (!name || !vals.length) { warnings.push('Skipped "' + line.slice(0, 40) + '" (needs a name and numbers)'); return; }
    const cells = [];
    vals.forEach((v, i) => {
      const month = months ? months[i] : fromMonth + i;
      if (!month || month > 12) return;
      if (isDash(v)) return;
      cells.push({ month, days: Number(v) });
    });
    if (months ? vals.length > months.length : fromMonth + vals.length - 1 > 12) warnings.push(name + ': more numbers than months, the extra ones are ignored');
    rows.push({ name, cells });
  });
  return { rows, warnings };
}

/** The team member a typed name means: the exact name, or the one person sharing the most words with it ("M. Shahbaz" -> Muhammad Shahbaz).
 *  Returns { person } or { error: 'not found' | 'more than one' }. */
export function matchPerson(name, people) {
  const n = norm(name);
  const exact = people.filter((p) => norm(p.name) === n);
  if (exact.length === 1) return { person: exact[0] };
  const nw = words(name);
  if (!nw.length) return { error: 'not found' };
  const scored = people.map((p) => ({ p, sc: words(p.name).filter((w) => nw.includes(w)).length }));
  const best = Math.max(0, ...scored.map((x) => x.sc));
  if (!best) return { error: 'not found' };
  const top = scored.filter((x) => x.sc === best);
  return top.length === 1 ? { person: top[0].p } : { error: 'more than one' };
}
