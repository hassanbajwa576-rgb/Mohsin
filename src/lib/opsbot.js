import 'server-only';
import { q } from './db';
import { todayKey, allOffices } from './att';
import { MONTHS, MON3, pkr, officeCosts, budgetByHead, erYears } from './exprev';
import { fundSummary, soAccount } from './queries';
import { visitorRows, insideNow, VLABEL } from './visitors';

// OpsBot without any AI service: it reads the question, works out what is asked (period, office, head, topic) and answers from the
// app's own data, for the person's own access only.

const norm = (s) => String(s || '').toLowerCase().replace(/bold belief/g, 'boldbelief').replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (n, re) => re.test(n);
const pc = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
const MONWORDS = MONTHS.flatMap((m, i) => [[m.toLowerCase(), i + 1], [m.slice(0, 3).toLowerCase(), i + 1]]).concat([['sept', 9]]);
const monthOf = (w) => (MONWORDS.find(([k]) => k === w) || [])[1] || 0;
const SUGGEST_OM = ['How much did we spend this year?', 'ISB spend by month', 'Top heads this year', 'Compare with last year', 'Budget vs actual year to date', 'Who holds the cash?'];
const SUGGEST_OTHER = ['What is my cash in hand?', 'How many expenses are waiting?', 'Visitors today', 'Advances outstanding'];

// The period asked for: a year plus a range of months.
function when(n, nowY, nowM) {
  let year = nowY;
  const ym = /\b(20\d\d)\b/.exec(n);
  if (ym) year = Number(ym[1]);
  else if (has(n, /\b(last|previous|prior) year\b/)) year = nowY - 1;
  const words = n.split(' ');
  const ms = [];
  words.forEach((w, i) => {
    const m = monthOf(w);
    if (m && !(w === 'may' && /^(i|we|you)$/.test(words[i + 1] || ''))) ms.push(m);
  });
  let from = 1;
  let to = year === nowY ? nowM : 12;
  let label = year === nowY ? 'January to ' + MONTHS[nowM - 1] : 'the whole year';
  const quarter = /\bq([1-4])\b/.exec(n);
  if (quarter) {
    from = (Number(quarter[1]) - 1) * 3 + 1;
    to = from + 2;
    label = 'Q' + quarter[1];
  } else if (has(n, /\blast month\b/)) {
    to = from = nowM === 1 ? 12 : nowM - 1;
    if (nowM === 1 && !ym) year = nowY - 1;
    label = MONTHS[from - 1];
  } else if (has(n, /\bthis month\b/)) {
    from = to = nowM;
    label = MONTHS[nowM - 1];
  } else if (ms.length >= 2) {
    from = Math.min(ms[0], ms[1]);
    to = Math.max(ms[0], ms[1]);
    label = MONTHS[from - 1] + ' to ' + MONTHS[to - 1];
  } else if (ms.length === 1) {
    from = to = ms[0];
    label = MONTHS[from - 1];
  } else if (has(n, /\b(ytd|year to date|so far)\b/)) {
    from = 1;
    to = year === nowY ? nowM : 12;
    label = 'year to date';
  } else if (has(n, /\b(whole|full|entire|all) year\b|\bfor the year\b/)) {
    to = 12;
    label = 'the whole year';
  }
  return { year, from, to, label: label + ' ' + year };
}

function pickHead(n, ccs) {
  const GENERIC = new Set(['office', 'service', 'services', 'and', 'expenses', 'employee', 'professional', 'retention']);
  let best = null;
  let score = 0;
  for (const cc of ccs) {
    const words = norm(cc.split(' - ')[0]).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w));
    for (const w of words) {
      if (new RegExp('\\b' + w + 's?\\b').test(n) && w.length > score) {
        score = w.length;
        best = cc;
      }
    }
  }
  // "office rent" and "office supplies" need the second word, which is not generic above.
  return best;
}

function agg(rows, f) {
  const out = { tot: 0, lhr: 0, isb: 0, byMonth: Array(12).fill(0), byHead: new Map() };
  for (const r of rows) {
    if (r.m < f.from || r.m > f.to) continue;
    if (f.exBB && /^boldbelief/i.test(String(r.cc || ''))) continue;
    if (f.head && r.cc !== f.head) continue;
    if (f.office !== 'ALL' && r.o !== f.office) continue;
    out.tot += r.s;
    out[r.o === 'ISB' ? 'isb' : 'lhr'] += r.s;
    out.byMonth[r.m - 1] += r.s;
    const k = r.cc || '(no cost center)';
    out.byHead.set(k, (out.byHead.get(k) || 0) + r.s);
  }
  return out;
}

const lines = (...a) => a.flat().filter((x) => x !== null && x !== undefined && x !== '').join('\n');
const sortedHeads = (a) => [...a.byHead.entries()].sort((x, y) => y[1] - x[1]);

async function pettyAnswer(user, n) {
  if (user.role === 'so') {
    const a = await soAccount(user.id);
    return lines('Your account:', 'Advances issued to you: ' + pkr(a.advances), 'Spent so far: ' + pkr(a.spent), 'Cash in hand: ' + pkr(a.cash), 'Not yet submitted: ' + pkr(a.draft), 'Advances outstanding: ' + pkr(a.outstanding));
  }
  if (has(n, /ready for accounts|approved/)) {
    const r = (await q("SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int AS c, COALESCE(SUM(amount), 0)::float8 AS v FROM pc2_expenses WHERE status = 'approved' AND batch_id IS NULL"))[0];
    return 'Ready for Accounts: ' + r.c + ' expense(s), ' + pkr(r.v) + '.';
  }
  if (has(n, /awaiting|pending|waiting|approval|review/)) {
    const r = (await q("SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int AS c, COALESCE(SUM(amount), 0)::float8 AS v FROM pc2_expenses WHERE status IN ('submitted', 'verified')"))[0];
    const d = (await q("SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int AS c, COALESCE(SUM(amount), 0)::float8 AS v FROM pc2_expenses WHERE status = 'draft'"))[0];
    return lines('Waiting for review: ' + r.c + ' expense(s), ' + pkr(r.v) + '.', 'Not yet submitted by Support Officers: ' + d.c + ' expense(s), ' + pkr(d.v) + '.');
  }
  const { rows } = await fundSummary();
  const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  if (has(n, /outstanding/)) {
    return lines('Advances outstanding: ' + pkr(sum('outstanding')) + ' (received from Accounts, not yet cleared by a submission).', ...rows.filter((r) => r.outstanding).map((r) => '  ' + r.label + ': ' + pkr(r.outstanding)));
  }
  if (has(n, /advance|received/)) {
    return lines('Received from Accounts in total: ' + pkr(sum('received')) + '. Advances outstanding: ' + pkr(sum('outstanding')) + '.', ...rows.filter((r) => r.received).map((r) => '  ' + r.label + ': ' + pkr(r.received)));
  }
  return lines(
    'Cash in hand: ' + pkr(sum('remaining')) + '.',
    'With the Sr. Ops Manager: ' + pkr(sum('pool')),
    'With the Sr. Support Officer: ' + pkr(sum('ssoCash')),
    'With Support Officers: ' + pkr(sum('soCash')),
    ...rows.filter((r) => r.remaining).map((r) => '  ' + r.label + ': ' + pkr(r.remaining))
  );
}

async function visitorsAnswer(user, n, nowY, nowM, today) {
  const both = allOffices(user);
  let office = both ? '' : user.office_code;
  if (both && has(n, /\bisb\b|islamabad/)) office = 'ISB';
  else if (both && has(n, /\blhr\b|lahore/)) office = 'LHR';
  const w = when(n, nowY, nowM);
  const explicit = has(n, /\b(month|year|ytd|week)\b|\b(20\d\d)\b/) || monthOf(n.split(' ').find((x) => monthOf(x)) || '');
  let from = today;
  let to = today;
  let label = 'today';
  if (explicit) {
    from = w.year + '-' + String(w.from).padStart(2, '0') + '-01';
    to = w.year + '-' + String(w.to).padStart(2, '0') + '-' + String(new Date(Date.UTC(w.year, w.to, 0)).getUTCDate()).padStart(2, '0');
    label = w.label;
  }
  const rows = await visitorRows({ from, to, office });
  const inside = await insideNow(office);
  const by = {};
  for (const r of rows) by[VLABEL[r.vtype] || r.vtype] = (by[VLABEL[r.vtype] || r.vtype] || 0) + 1;
  return lines(
    rows.length + ' visitor(s) ' + label + (office ? ' in ' + office : '') + '.',
    ...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => '  ' + k + ': ' + v),
    'Inside now: ' + inside.length + '.'
  );
}

export async function opsbotAnswer(user, text) {
  const n = norm(text);
  const today = todayKey();
  const nowY = Number(today.slice(0, 4));
  const nowM = Number(today.slice(5, 7));
  const om = user.role === 'om';
  const sugg = om ? SUGGEST_OM : SUGGEST_OTHER;
  if (!n) return { reply: 'Ask me something about the app.', suggestions: sugg };
  if (has(n, /^(hi|hello|hey|salam|help)\b|what can you|who are you|how do i ask/)) {
    return { reply: om ? 'I am OpsBot. I answer from the data in OpsTrack. Ask about spending by office, head or month, the budget, year against year, cash in hand, advances, expenses waiting for approval, or visitors. Name a month, a year or a head (for example "Travel in August for ISB"). I only know what is in the app.' : 'I am OpsBot. I answer from the data in OpsTrack that you can open: your cash in hand, advances, expenses and visitors.', suggestions: sugg };
  }
  if (has(n, /visitor|inside now|who is in\b|who is inside/)) return { reply: await visitorsAnswer(user, n, nowY, nowM, today), suggestions: [] };
  const money = has(n, /spend|spent|cost|expens|paid|how much|total|budget|variance|compare|versus|\bvs\b|head|office|isb|lhr|travel|rent|month|share|percent|top|biggest/);
  const pettyTopic = has(n, /cash in hand|cih|holding|who has|who holds|advance|outstanding|ready for accounts|awaiting|pending|waiting|approval|my cash|my expenses/);
  if (pettyTopic && !has(n, /budget|isb|lhr|head|month|compare|travel|rent/)) return { reply: await pettyAnswer(user, n), suggestions: [] };
  if (!om) {
    if (money) return { reply: await pettyAnswer(user, n), suggestions: sugg };
    return { reply: 'I did not understand that. You can ask about your cash in hand, advances, expenses waiting, or visitors.', suggestions: sugg };
  }
  if (!money) return { reply: 'I did not understand that. Try one of these, or name a month, year, head or office.', suggestions: sugg };

  // Sr. Ops Manager: expenditure analysis
  const w = when(n, nowY, nowM);
  const office = has(n, /\bisb\b|islamabad/) && !has(n, /\blhr\b|lahore/) ? 'ISB' : has(n, /\blhr\b|lahore/) && !has(n, /\bisb\b|islamabad/) ? 'LHR' : 'ALL';
  const exBB = has(n, /without boldbelief|excluding boldbelief|excl boldbelief|operational/);
  const ccs = (await q("SELECT DISTINCT cost_center FROM pc2_er_entries WHERE cost_center <> ''")).map((r) => r.cost_center);
  const head = pickHead(n, ccs);
  const f = { from: w.from, to: w.to, office, head, exBB };
  const where = (head ? ' on ' + head : '') + (office !== 'ALL' ? ' for ' + office : '') + (exBB ? ' (without BOLDBelief)' : '');
  const note = 'As booked: an entry with no office counts as LHR.';
  const rows = await officeCosts(w.year);
  const a = agg(rows, f);

  if (has(n, /budget|variance|provision|over budget|under budget|left/)) {
    const bud = await budgetByHead(w.year);
    let B = 0;
    for (const [cc, arr] of Object.entries(bud)) {
      if (exBB && /^boldbelief/i.test(cc)) continue;
      if (head && cc !== head) continue;
      B += arr.slice(w.from - 1, w.to).reduce((x, y) => x + y, 0);
    }
    const actual = agg(rows, { ...f, office: 'ALL' }).tot;
    return { reply: lines('Budget ' + w.label + (head ? ' on ' + head : '') + (exBB ? ' (without BOLDBelief)' : '') + ':', 'Budgeted: ' + pkr(B), 'Spent (from the entries): ' + pkr(actual), actual > B ? 'Over budget by ' + pkr(actual - B) + '.' : 'Left in budget: ' + pkr(B - actual) + '.', office !== 'ALL' ? 'The workbook has no budget per office, so this is for both offices.' : '', 'The Budget vs Actual page uses the workbook\'s own figures for the months it has worked out, so small differences are possible.'), suggestions: [] };
  }
  if (has(n, /compare|versus|\bvs\b|year wise|year over year|yearly|previous year|last year/) && !has(n, /^how much did we spend last year$/)) {
    const ys = (await erYears()).slice(0, 4).sort((x, y) => x - y);
    const out = [];
    let prev = null;
    for (const yy of ys) {
      const t = agg(yy === w.year ? rows : await officeCosts(yy), f).tot;
      if (t > 0) {
        out.push('  ' + yy + ': ' + pkr(t) + (prev ? ' (' + (t >= prev ? '+' : '') + pc(t - prev, prev) + ' on the year before)' : ''));
        prev = t;
      }
    }
    return { reply: lines('Spend' + where + ', ' + MONTHS[w.from - 1] + ' to ' + MONTHS[w.to - 1] + ', year by year:', ...out, note), suggestions: [] };
  }
  if (has(n, /month wise|month by month|monthly|each month|by month|trend|per month/)) {
    const ml = [];
    for (let m = w.from; m <= w.to; m++) ml.push('  ' + MON3[m - 1] + ': ' + pkr(a.byMonth[m - 1]));
    return { reply: lines('Spend' + where + ' by month, ' + w.year + ':', ...ml, 'Total: ' + pkr(a.tot), note), suggestions: [] };
  }
  if (has(n, /top|biggest|highest|largest|most/) || has(n, /head wise|by head|per head|each head|breakdown|categories/)) {
    const list = sortedHeads(a).slice(0, has(n, /top/) ? 5 : 15);
    return { reply: lines('Spend' + where + ', ' + w.label + (has(n, /top|biggest|highest|largest|most/) ? ' (largest first)' : '') + ':', ...list.map(([k, v]) => '  ' + k + ': ' + pkr(v) + ' (' + pc(v, a.tot) + ')'), 'Total: ' + pkr(a.tot), note), suggestions: [] };
  }
  if (has(n, /share|percent|%|split|office wise|by office|\bisb\b.*\blhr\b|\blhr\b.*\bisb\b/) || (office === 'ALL' && has(n, /\b(isb|lhr)\b/))) {
    const both = agg(rows, { ...f, office: 'ALL' });
    return { reply: lines('Spend' + (head ? ' on ' + head : '') + (exBB ? ' (without BOLDBelief)' : '') + ', ' + w.label + ':', 'LHR: ' + pkr(both.lhr) + ' (' + pc(both.lhr, both.tot) + ')', 'ISB: ' + pkr(both.isb) + ' (' + pc(both.isb, both.tot) + ')', 'Total: ' + pkr(both.tot), note), suggestions: [] };
  }
  const span = w.to - w.from + 1;
  const top = head ? [] : sortedHeads(a).slice(0, 3);
  return { reply: lines('Spend' + where + ', ' + w.label + ': ' + pkr(a.tot) + '.', office === 'ALL' ? 'LHR ' + pkr(a.lhr) + ' (' + pc(a.lhr, a.tot) + '), ISB ' + pkr(a.isb) + ' (' + pc(a.isb, a.tot) + ').' : '', 'About ' + pkr(a.tot / Math.max(1, span)) + ' a month over ' + span + ' month(s).', top.length ? 'Biggest heads: ' + top.map(([k, v]) => k + ' ' + pkr(v)).join('; ') + '.' : '', note), suggestions: [] };
}
