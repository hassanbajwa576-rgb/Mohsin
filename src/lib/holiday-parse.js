// Reads the text of a Pakistan government holiday notification (from a scan or a text PDF) and lists the holidays in it.
// Public holidays come first in the list and are pre-selected; optional holidays are marked so they are left out by default.
// Scans are never perfect, so the page shows the result for checking before anything is saved.
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
const monthIndex = (w) => {
  const k = w.toLowerCase();
  const i = MONTHS.findIndex((m) => m === k || m.startsWith(k.slice(0, 3)));
  return i;
};
const pad = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => {
  const t = new Date(Date.UTC(y, m, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d;
};

// "20th, 21st & 22nd March 2026" -> [20, 21, 22] in March
const SUF = '(?:st|nd|rd|th|d|[%*°¢+])?';
const D = '(?<!\\d)\\d{1,2}(?!\\d)';
const DAYLIST = new RegExp('((?:' + D + '\\s*' + SUF + '\\s*(?:,|&|and|to|-|–)?\\s*)+)\\s*' + MON_RE + '\\.?,?\\s*(\\d{4})?', 'gi');
const MDY = new RegExp(MON_RE + '\\.?\\s+(\\d{1,2})\\s*' + SUF + '\\s*,?\\s*(\\d{4})?', 'gi');
const NUMERIC = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;

function dates(line, year) {
  const out = [];
  let rest = line;
  let m;
  NUMERIC.lastIndex = 0;
  while ((m = NUMERIC.exec(line))) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const y = Number(m[3]);
    if (valid(y, mo, d)) out.push(y + '-' + pad(mo + 1) + '-' + pad(d));
    rest = rest.replace(m[0], ' ');
  }
  DAYLIST.lastIndex = 0;
  while ((m = DAYLIST.exec(line))) {
    const mo = monthIndex(m[2]);
    const y = m[3] ? Number(m[3]) : year;
    const nums = [...m[1].matchAll(/(?<!\d)\d{1,2}(?!\d)/g)].map((x) => Number(x[0]));
    // "20 - 22 March" is a range
    const range = /\d\s*(to|-|–)\s*\d/.test(m[1]) && nums.length === 2 && nums[1] > nums[0] && nums[1] - nums[0] < 6;
    const list = range ? Array.from({ length: nums[1] - nums[0] + 1 }, (_, i) => nums[0] + i) : nums;
    for (const d of list) if (mo >= 0 && d >= 1 && d <= 31 && valid(y, mo, d)) out.push(y + '-' + pad(mo + 1) + '-' + pad(d));
    rest = rest.replace(m[0], ' ');
  }
  if (!out.length) {
    MDY.lastIndex = 0;
    while ((m = MDY.exec(line))) {
      const mo = monthIndex(m[1]);
      const d = Number(m[2]);
      const y = m[3] ? Number(m[3]) : year;
      if (mo >= 0 && valid(y, mo, d)) out.push(y + '-' + pad(mo + 1) + '-' + pad(d));
      rest = rest.replace(m[0], ' ');
    }
  }
  return { out, rest };
}

const clean = (s) => s
  .replace(/\([^)]*\)?/g, ' ')
  .replace(/\b(shawal|zil\s*haj|moharram|muharram|rabi[- ]?ul[- ]?awwal|rajab|shaban|safar|ramazan|ramadan)\b.*$/i, ' ')
  .replace(/(?<!good\s)\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b\.?/gi, ' ')
  .replace(/^[\s\d.)\-–|:,;]+/, '')
  .replace(/[|]+/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .replace(/[\s,;:&\/\-–(]+$/, '')
  .replace(/^(?:(?=\S{1,3}\s)\S*[^A-Za-z\s]\S*\s+)+/, '')
  .replace(/^(?:[A-Za-z]{1,2}\s+)+(?=[A-Za-z]{3,})/, '')
  .replace(/^[^A-Za-z]+/, '')
  .replace(/\bBid\b/g, 'Eid')
  .replace(/Igbal/g, 'Iqbal')
  .trim();

// text: everything OCR or the PDF gave; fallbackYear: the year chosen on the page.
export function parseHolidays(text, fallbackYear) {
  const years = [...String(text).matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const count = {};
  for (const y of years) count[y] = (count[y] || 0) + 1;
  const docYear = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  // The year picked on the page wins when the document mentions it; otherwise the year the document mentions most.
  const year = years.includes(Number(fallbackYear)) ? Number(fallbackYear) : Number(docYear) || Number(fallbackYear) || new Date().getFullYear();
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let mode = 'public'; // public, optional or bank (bank holidays close the banks only, they are not public holidays)
  let prevName = '';
  const found = new Map();
  for (const line of lines) {
    // a heading about optional holidays switches the rest to "optional"; one about public holidays switches back
    if (/bank\s+holidays?/i.test(line) && !dates(line, year).out.length) mode = 'bank';
    else if (/optional\s+holidays?|restricted\s+holidays?/i.test(line) && !dates(line, year).out.length) mode = 'optional';
    else if (/(public|gazetted|general)\s+holidays?|list\s+of\s+holidays?/i.test(line) && !dates(line, year).out.length) mode = 'public';
    const all = dates(line, year);
    // Only dates in the notification's year count (this drops the issue date and file numbers in the letterhead).
    const out = all.out.filter((d) => d.slice(0, 4) === String(year));
    const rest = all.rest;
    if (!out.length) {
      const t = clean(line);
      // a name on its own line is often followed by its date on the next line
      prevName = t.length > 3 && t.length < 70 && !/^(s\.?\s*no|sr|date|day|occasion|holiday|notification)/i.test(t) ? t : '';
      continue;
    }
    let name = clean(rest);
    if (name.length < 3) name = prevName || 'Holiday';
    name = name.slice(0, 80);
    const kind = mode === 'optional' || /optional/i.test(line) ? 'optional' : mode === 'bank' ? 'bank' : 'public';
    if (kind === 'bank') name = 'Bank holiday';
    const rank = { public: 3, optional: 2, bank: 1 };
    for (const day of out) {
      const old = found.get(day);
      if (!old || rank[kind] > rank[old.kind]) found.set(day, { day, name, kind, optional: kind !== 'public' });
      else if (old.kind === kind && !old.name.toLowerCase().includes(name.toLowerCase())) old.name = (old.name + ' / ' + name).slice(0, 80);
    }
    prevName = '';
  }
  return [...found.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}
