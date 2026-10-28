import 'server-only';
import { q } from './db';
import { todayKey, allOffices, dayBoard, stateOf } from './att';
import { can } from './perms';
import { MONTHS, MON3, pkr, officeCosts, budgetByHead, erYears, headcount } from './exprev';
import { fundSummary, soAccount } from './queries';
import { visitorRows, insideNow, VLABEL } from './visitors';
import { FUNDS } from './fmt';

// OpsBot without any AI service: it reads the question, works out what is asked (period, office, head, topic) and answers from the
// app's own data, for the person's own access only.

const norm = (s) => String(s || '').toLowerCase().replace(/bold belief/g, 'boldbelief').replace(/[^a-z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (n, re) => re.test(n);
const pc = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '-');
const MONWORDS = MONTHS.flatMap((m, i) => [[m.toLowerCase(), i + 1], [m.slice(0, 3).toLowerCase(), i + 1]]).concat([['sept', 9]]);
const monthOf = (w) => (MONWORDS.find(([k]) => k === w) || [])[1] || 0;
const SUGGEST_OM = ['How much did we spend this year?', 'ISB spend by month', 'Top heads this year', 'Compare with last year', 'Budget vs actual year to date', 'Who holds the cash?', 'Who is on duty today?', 'How many employees in ISB?', 'Open complaints', 'Find 18376'];
const IDEAS_OM = ['SPENDING: How much did we spend this year? | ISB spend by month | Top heads in Q2 | Travel from March to June | Cost per employee | Highest month this year | Biggest vendors', 'COMPARE: Compare with last year | Year by year for office rent', 'BUDGET: Budget vs actual year to date | Budget for Bank Fees', 'CASH: Who holds the cash? | Advances outstanding | Funds received this month | Cash returned this year | Latest batches', 'PETTY: Zubair expenses this month | Rejected expenses | Expenses by category | Biggest expenses this month | Find 18376', 'PEOPLE: Who is on duty today? | How many employees in ISB? | Who is off this week? | Who is Imran?', 'OTHER: Visitors today | Visitors still expected | Open complaints | What needs my attention? | What changed today?'];
const SUGGEST_OTHER = ['What is my cash in hand?', 'How many expenses are waiting?', 'Visitors today', 'Advances outstanding', 'Open complaints'];

// The period asked for: a year plus a range of months.
function when(n, nowY, nowM) {
  let year = nowY;
  let explicit = false;
  const ym = /\b(20\d\d)\b/.exec(n);
  if (ym) { year = Number(ym[1]); explicit = true; }
  else if (has(n, /\b(last|previous|prior) year\b/)) { year = nowY - 1; explicit = true; }
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
  if (quarter || has(n, /\blast month\b|\bthis month\b|\b(ytd|year to date|so far)\b|\b(whole|full|entire|all) year\b|\bfor the year\b/) || ms.length) explicit = true;
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
  return { year, from, to, label: label + ' ' + year, explicit };
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

// More topics: attendance, headcount, complaints, time off, fuel, the team, a person's expenses, and finding an amount.
const STATUS_WORDS = [[/not yet submitted|draft/, 'draft', 'not yet submitted'], [/rejected/, 'rejected', 'rejected'], [/sent to accounts|submitted to accounts/, 'sent', 'sent to Accounts'], [/ready for accounts|approved/, 'approved', 'approved (ready for Accounts)'], [/awaiting|pending|submitted/, 'submitted', 'awaiting review']];
const officeAsked = (n, user) => (allOffices(user) ? (has(n, /\bisb\b|islamabad/) && !has(n, /\blhr\b|lahore/) ? 'ISB' : has(n, /\blhr\b|lahore/) && !has(n, /\bisb\b|islamabad/) ? 'LHR' : '') : user.office_code);
const names = (list, max = 15) => list.slice(0, max).map((x) => '  ' + x).join('\n') + (list.length > max ? '\n  and ' + (list.length - max) + ' more' : '');
const range = (w) => [w.year + '-' + String(w.from).padStart(2, '0') + '-01', w.year + '-' + String(w.to).padStart(2, '0') + '-' + String(new Date(Date.UTC(w.year, w.to, 0)).getUTCDate()).padStart(2, '0')];

async function extraTopics(user, n, nowY, nowM, today) {
  const om = user.role === 'om';
  const sup = om || user.role === 'sso';
  const office = officeAsked(n, user);
  // Attendance: who is in
  if (has(n, /attendance|present|absent|on duty|on break|checked in|not in yet|who is in today|staff in|employees in/) && !has(n, /visitor/)) {
    if (!can(user, 'att_view')) return 'You do not have access to the attendance board, so I cannot answer that.';
    const { staff, by } = await dayBoard(today, office);
    const on = [];
    const brk = [];
    const out = [];
    const none = [];
    for (const s of staff) {
      const evs = by.get(s.id) || [];
      if (!evs.length) none.push(s.name);
      else {
        const st = stateOf(evs).state;
        (st === 'on' ? on : st === 'break' ? brk : out).push(s.name);
      }
    }
    const wantList = has(n, /\bwho\b|list|names/);
    return lines('Attendance today' + (office ? ' in ' + office : '') + ' (' + staff.length + ' active employees):', '  On duty: ' + on.length, '  On break: ' + brk.length, '  Checked out: ' + out.length, '  No entry yet: ' + none.length, wantList && on.length ? 'On duty:\n' + names(on) : '', wantList && none.length && has(n, /absent|not in|no entry/) ? 'No entry yet:\n' + names(none) : '');
  }
  if (has(n, /how many (employees|staff|people)|headcount|strength|number of (employees|staff)/)) {
    if (!sup && !can(user, 'att_view')) return 'Headcount is available to managers.';
    const h = await headcount();
    return lines('Active employees in the Attendance list: ' + (h.LHR + h.ISB) + '.', '  LHR: ' + h.LHR + ' (' + pc(h.LHR, h.LHR + h.ISB) + ')', '  ISB: ' + h.ISB + ' (' + pc(h.ISB, h.LHR + h.ISB) + ')');
  }
  if (has(n, /complaint|ticket/) && has(n, /category|categories|by type/)) {
    const rr = await q("SELECT c.category AS k, COUNT(*)::int AS n FROM pc2_complaints c JOIN pc2_offices o ON o.id = c.office_id WHERE c.status = 'open'" + (office ? " AND o.code = '" + office + "'" : '') + ' GROUP BY 1 ORDER BY 2 DESC');
    return rr.length ? lines('Open complaints by category' + (office ? ' in ' + office : '') + ':', ...rr.map((x) => '  ' + x.k + ': ' + x.n)) : 'There are no open complaints.';
  }
  if (has(n, /complaint|ticket/)) {
    const where = office ? "AND o.code = '" + office + "'" : '';
    const r = (await q("SELECT COUNT(*) FILTER (WHERE c.status = 'open')::int AS open, COUNT(*) FILTER (WHERE c.status = 'open' AND c.due_on < $1::date)::int AS late, COUNT(*)::int AS total FROM pc2_complaints c JOIN pc2_offices o ON o.id = c.office_id WHERE true " + where, [today]))[0];
    return lines('Complaints' + (office ? ' in ' + office : '') + ': ' + r.total + ' in total.', '  Open: ' + r.open, '  Open and past the due date: ' + r.late);
  }
  if (has(n, /time off|leave|pto|off request/)) {
    if (!sup) return 'Time off numbers are available to the Sr. Ops Manager and the Sr. Support Officer.';
    const r = (await q("SELECT COUNT(*)::int AS n FROM pc2_hk_off WHERE status = 'pending'"))[0];
    return 'Time off requests waiting for a decision: ' + r.n + '.';
  }
  if (has(n, /fuel|refill|top up/)) {
    if (!can(user, 'fuel_use')) return 'You do not have access to FuelTrack.';
    const r = (await q("SELECT COUNT(*)::int AS n FROM pc2_fuel_refill WHERE status = 'open'"))[0];
    return 'Fuel refill requests still open: ' + r.n + '.';
  }
﻿  // ---- more topics
  const wP = when(n, nowY, nowM);
  const [pFrom, pTo] = range(wP);
  // What needs attention (Sr. Ops Manager)
  if (has(n, /needs? (my )?attention|what is pending|what s pending|anything pending|to do list|waiting for me|what should i do/)) {
    if (!om) return 'That summary is for the Sr. Ops Manager. Ask me about your own expenses or advances.';
    const r = (await q("SELECT (SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int FROM pc2_expenses WHERE status IN ('submitted', 'verified')) AS exp, (SELECT COUNT(*)::int FROM pc2_visitors WHERE del_req_by IS NOT NULL) AS vis, (SELECT COUNT(*)::int FROM pc2_hk_off WHERE status = 'pending') AS off, (SELECT COUNT(*)::int FROM pc2_fuel_refill WHERE status = 'open') AS fuel, (SELECT COUNT(DISTINCT COALESCE(split_group, id::text))::int FROM pc2_expenses WHERE status = 'approved' AND batch_id IS NULL) AS ready"))[0];
    return lines('Waiting for you:', '  Expenses to approve: ' + r.exp, '  Visitor delete requests: ' + r.vis, '  Time off requests: ' + r.off, '  Fuel refill requests open: ' + r.fuel, '  Approved expenses not yet sent to Accounts: ' + r.ready);
  }
  // Who is off (Support roster)
  if (has(n, /who is off|who s off|on leave|off today|off this week|time off today/)) {
    if (!sup) return 'The roster is available to the Sr. Ops Manager and the Sr. Support Officer.';
    const week = has(n, /week/);
    const r = await q("SELECT p.name, h.kind, to_char(h.from_date, 'DD Mon') AS f, to_char(h.to_date, 'DD Mon') AS t FROM pc2_hk_off h JOIN pc2_hk_people p ON p.id = h.hk_id WHERE h.from_date <= ($1::date + $2::int) AND h.to_date >= $1::date ORDER BY h.from_date LIMIT 20", [today, week ? 6 : 0]);
    return r.length ? lines('Time off ' + (week ? 'in the next 7 days' : 'today') + ':', ...r.map((x) => '  ' + x.name + ' - ' + x.kind + ' (' + x.f + (x.f === x.t ? '' : ' to ' + x.t) + ')')) : 'Nobody has time off ' + (week ? 'in the next 7 days' : 'today') + '.';
  }
  // Expected visitors and no shows
  if (has(n, /expected visitor|visitors? expected|expecting|coming today|coming tomorrow|no show|noshow/)) {
    const scope = allOffices(user) ? '' : user.office_code;
    if (has(n, /no show|noshow/)) {
      const r = (await q("SELECT COUNT(*)::int AS n FROM pc2_expected e JOIN pc2_offices o ON o.id = e.office_id WHERE e.status = 'noshow' AND e.due_at >= $1::date AND e.due_at < ($2::date + 1) AND ($3 = '' OR o.code = $3)", [pFrom, pTo, scope]))[0];
      return 'No shows ' + wP.label + ': ' + r.n + '.';
    }
    const r = await q("SELECT e.name, e.vtype, e.host, to_char(e.due_at AT TIME ZONE 'Asia/Karachi', 'DD Mon HH24:MI') AS at FROM pc2_expected e JOIN pc2_offices o ON o.id = e.office_id WHERE e.status = 'waiting' AND ($1 = '' OR o.code = $1) ORDER BY e.due_at LIMIT 10", [scope]);
    return r.length ? lines('Visitors still expected (' + r.length + (r.length === 10 ? ' or more' : '') + '):', ...r.map((x) => '  ' + x.at + '  ' + x.name + (x.host ? ' to see ' + x.host : '') + ' (' + (VLABEL[x.vtype] || x.vtype) + ')')) : 'No visitors are expected right now.';
  }
  // What changed (audit log, Sr. Ops Manager)
  if (has(n, /what changed|recent changes|latest activity|recent activity|audit log|who changed/)) {
    if (!om) return 'The activity log is for the Sr. Ops Manager.';
    const r = await q("SELECT actor_name, summary, to_char(at AT TIME ZONE 'Asia/Karachi', 'DD Mon HH24:MI') AS t FROM pc2_audit ORDER BY id DESC LIMIT 8");
    return lines('Latest activity:', ...r.map((x) => '  ' + x.t + '  ' + x.actor_name + ': ' + String(x.summary).slice(0, 110)));
  }
  // Cost per employee
  if (has(n, /per employee|per head count|per person|cost per (employee|staff)|per staff/)) {
    if (!om) return 'Cost analysis is for the Sr. Ops Manager.';
    const rowsC = await officeCosts(wP.year);
    const a = agg(rowsC, { from: wP.from, to: wP.to, office: office || 'ALL', head: null, exBB: has(n, /without boldbelief|excluding boldbelief|operational/) });
    const h = await headcount();
    const cnt = office === 'ISB' ? h.ISB : office === 'LHR' ? h.LHR : h.LHR + h.ISB;
    return cnt ? lines('Spend ' + wP.label + (office ? ' for ' + office : '') + ': ' + pkr(a.tot) + ' over ' + cnt + ' employees.', 'About ' + pkr(a.tot / cnt) + ' per employee, ' + pkr(a.tot / cnt / Math.max(1, wP.to - wP.from + 1)) + ' per employee a month.') : 'There are no active employees in the Attendance list to divide by.';
  }
  // Vendors and payment modes (ExpRev)
  if (has(n, /vendor|supplier|payment mode|pay mode|paid by cash|petty cash entries/) && om) {
    const col = has(n, /payment mode|pay mode/) ? 'pay_mode' : 'vendor';
    const r = await q("SELECT COALESCE(NULLIF(" + col + ", ''), '(blank)') AS k, SUM(amount)::float8 AS v, COUNT(*)::int AS c FROM pc2_er_entries WHERE spent_on >= $1 AND spent_on <= $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 8", [pFrom, pTo]);
    return lines((col === 'vendor' ? 'Biggest vendors' : 'Spend by payment mode') + ', ' + wP.label + ':', ...r.map((x) => '  ' + x.k + ': ' + pkr(x.v) + ' (' + x.c + ' entries)'));
  }
  // Petty: by category or fund, biggest and average expense, funds received, returns, batches
  if (has(n, /by category|by fund|categories|which fund|per fund|per category/) && has(n, /expens|spend|spent|fund|categor/) && !has(n, /head|cost center/)) {
    const col = has(n, /fund/) ? 'e.fund' : 'e.category';
    const args = [pFrom, pTo];
    let sql = "FROM pc2_expenses e WHERE e.status <> 'rejected' AND e.spent_on >= $1 AND e.spent_on <= $2";
    if (user.role === 'so') { args.push(user.id); sql += ' AND e.submitted_by = $3'; }
    const r = await q('SELECT ' + col + ' AS k, SUM(e.amount)::float8 AS v FROM pc2_expenses e WHERE e.status <> \'rejected\' AND e.spent_on >= $1 AND e.spent_on <= $2' + (user.role === 'so' ? ' AND e.submitted_by = $3' : '') + ' GROUP BY 1 ORDER BY 2 DESC LIMIT 12', args);
    return lines('Petty expenses ' + (col === 'e.fund' ? 'by fund' : 'by category') + ', ' + wP.label + ':', ...r.map((x) => '  ' + (col === 'e.fund' ? FUNDS[x.k] || x.k : x.k) + ': ' + pkr(x.v)));
  }
  if (has(n, /(biggest|largest|highest|top) (petty )?(expense|entry|entries|expenses)|average expense/) && !has(n, /head|cost center|exprev/)) {
    const args = [pFrom, pTo];
    const r = await q("SELECT to_char(e.spent_on, 'YYYY-MM-DD') AS d, e.category, e.amount::float8 AS a, u.name FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by WHERE e.status <> 'rejected' AND e.spent_on >= $1 AND e.spent_on <= $2" + (user.role === 'so' ? ' AND e.submitted_by = ' + Number(user.id) : '') + ' ORDER BY e.amount DESC LIMIT 5', args);
    const av = (await q("SELECT COALESCE(AVG(e.amount), 0)::float8 AS v, COUNT(*)::int AS c FROM pc2_expenses e WHERE e.status <> 'rejected' AND e.spent_on >= $1 AND e.spent_on <= $2" + (user.role === 'so' ? ' AND e.submitted_by = ' + Number(user.id) : ''), args))[0];
    return lines('Petty expenses ' + wP.label + ': ' + av.c + ' expense(s), average ' + pkr(av.v) + '.', 'Biggest:', ...r.map((x) => '  ' + x.d + '  ' + pkr(x.a) + '  ' + x.category + ' (' + x.name + ')'));
  }
  if (has(n, /received from accounts|funds received|advances received|money received/) && sup) {
    const r = (await q('SELECT COALESCE(SUM(amount), 0)::float8 AS v, COUNT(*)::int AS c FROM pc2_advances WHERE received_on >= $1 AND received_on <= $2', [pFrom, pTo]))[0];
    return 'Received from Accounts ' + wP.label + ': ' + pkr(r.v) + ' in ' + r.c + ' receipt(s).';
  }
  if (has(n, /returned|returns|cash returned/) && sup) {
    const r = (await q('SELECT COALESCE(SUM(amount), 0)::float8 AS v, COUNT(*)::int AS c FROM pc2_returns WHERE returned_on >= $1 AND returned_on <= $2', [pFrom, pTo]))[0];
    return 'Cash returned to Accounts ' + wP.label + ': ' + pkr(r.v) + ' in ' + r.c + ' return(s).';
  }
  if (has(n, /batch/) && sup) {
    const r = await q("SELECT id, total::float8 AS total, item_count, to_char(created_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD') AS d FROM pc2_batches ORDER BY id DESC LIMIT 4");
    return r.length ? lines('Latest batches sent to Accounts:', ...r.map((x) => '  #' + x.id + '  ' + x.d + '  ' + x.item_count + ' expenses  ' + pkr(x.total))) : 'No batch has been sent to Accounts yet.';
  }
  const us = await q('SELECT u.id, u.name, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.active');
  const person = us.find((x) => norm(x.name).split(' ').some((w) => w.length >= 3 && new RegExp('\\b' + w + '\\b').test(n)));
  const ROLE = { om: 'Sr. Ops Manager', sso: 'Sr. Support Officer', so: 'Support Officer', guard: 'Security Guard' };
  if (has(n, /^who is\b|^who are\b|\bteam\b|list (of )?(users|people|members)/) && !has(n, /cash|holding|holds/)) {
    if (!om) return 'The team list is available to the Sr. Ops Manager.';
    if (person && has(n, /^who is\b/)) return person.name + ' is a ' + ROLE[person.role] + ' in ' + person.office + '.';
    return lines('Team (' + us.length + ' active):', ...Object.keys(ROLE).map((r) => (us.filter((x) => x.role === r).length ? '  ' + ROLE[r] + ': ' + us.filter((x) => x.role === r).map((x) => x.name + ' (' + x.office + ')').join(', ') : '')));
  }
  // Find an amount
  const num = /\b(\d{1,3}(?:,\d{3})+|\d{3,9})\b/.exec(String(n).replace(/(\d),(\d{3})/g, '$1,$2'));
  if (has(n, /find|search|look up|lookup|entry of|amount of|which entry/) && num && om) {
    const v = Number(num[1].replace(/,/g, ''));
    const er = await q("SELECT spent_on::text AS d, cost_center, detail, amount::float8 AS a, office FROM pc2_er_entries WHERE amount = $1 ORDER BY spent_on DESC LIMIT 6", [v]);
    const pe = await q("SELECT to_char(e.spent_on, 'YYYY-MM-DD') AS d, e.category, e.description, e.status, u.name FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by WHERE e.amount = $1 ORDER BY e.spent_on DESC LIMIT 6", [v]);
    if (!er.length && !pe.length) return 'I found no entry of ' + pkr(v) + '.';
    return lines('Entries of ' + pkr(v) + ':', ...er.map((r) => '  ExpRev ' + r.d + ': ' + r.cost_center + (r.detail ? ' - ' + r.detail : '') + (r.office ? ' (' + r.office + ')' : '')), ...pe.map((r) => '  Petty ' + r.d + ': ' + r.category + (r.description ? ' - ' + r.description : '') + ' (' + r.name + ', ' + r.status + ')'));
  }
  // A person's expenses, or expenses in a stage
  const stat = STATUS_WORDS.find(([re]) => re.test(n));
  if ((person && has(n, /expens|spent|spend|advance|issued/)) || (stat && has(n, /expens/) && !has(n, /spend|budget/))) {
    const self = user.role === 'so';
    const [from, to] = range(when(n, nowY, nowM));
    const w = when(n, nowY, nowM);
    const args = [from, to];
    let sql = "FROM pc2_expenses e JOIN pc2_users u ON u.id = e.submitted_by JOIN pc2_offices o ON o.id = e.office_id WHERE e.spent_on >= $1 AND e.spent_on <= $2";
    if (self) { args.push(user.id); sql += ' AND e.submitted_by = $' + args.length; } else if (person && has(n, /expens|spent|spend/)) { args.push(person.id); sql += ' AND e.submitted_by = $' + args.length; }
    if (stat) { args.push(stat[1]); sql += ' AND e.status = $' + args.length; } else sql += " AND e.status <> 'rejected'";
    if (office && !self) { args.push(office); sql += ' AND o.code = $' + args.length; }
    const r = (await q('SELECT COUNT(DISTINCT COALESCE(e.split_group, e.id::text))::int AS c, COALESCE(SUM(e.amount), 0)::float8 AS v ' + sql, args))[0];
    const last = await q("SELECT to_char(e.spent_on, 'YYYY-MM-DD') AS d, e.category, e.amount::float8 AS a, u.name " + sql + ' ORDER BY e.spent_on DESC, e.id DESC LIMIT 5', args);
    if (person && has(n, /advance|issued/) && !has(n, /expens|spent|spend/)) {
      const adv = (await q('SELECT COALESCE(SUM(i.amount), 0)::float8 AS v, COUNT(*)::int AS c FROM pc2_issues i WHERE i.issued_to = $1 AND i.issued_on >= $2 AND i.issued_on <= $3', [person.id, from, to]))[0];
      return 'Advances issued to ' + person.name + ' ' + w.label + ': ' + pkr(adv.v) + ' (' + adv.c + ' advance(s)).';
    }
    return lines((person && !self ? person.name + ': ' : '') + r.c + ' expense(s)' + (stat ? ' ' + stat[2] : '') + ', ' + w.label + ': ' + pkr(r.v) + '.', last.length ? 'Latest:' : '', ...last.map((x) => '  ' + x.d + '  ' + x.category + '  ' + pkr(x.a) + (person && !self ? '' : '  (' + x.name + ')')));
  }
  return null;
}

export async function opsbotAnswer(user, text, ctx = null) {
  const n = norm(text);
  const today = todayKey();
  const nowY = Number(today.slice(0, 4));
  const nowM = Number(today.slice(5, 7));
  const om = user.role === 'om';
  const sugg = om ? SUGGEST_OM : SUGGEST_OTHER;
  if (!n) return { reply: 'Ask me something about the app.', suggestions: sugg };
  if (has(n, /what can i ask|ideas|examples|what can you do|show me questions|list of questions|topics/) && om) return { reply: 'You can ask me things like:\n' + IDEAS_OM.map((x) => '- ' + x).join('\n'), suggestions: SUGGEST_OM };
  if (has(n, /what can i ask|ideas|examples|what can you do/) && !om) return { reply: 'You can ask me things like:\n- What is my cash in hand?\n- How many expenses are waiting?\n- Advances outstanding\n- Visitors today\n- Open complaints\n- Who is on duty today? (if you can see attendance)', suggestions: SUGGEST_OTHER };
  if (has(n, /^(hi|hello|hey|salam|help)\b|who are you|how do i ask/)) {
    return { reply: om ? 'I am OpsBot. I answer from the data in OpsTrack. Ask about spending by office, head or month, the budget, year against year, cash in hand, advances, the expenses of one person ("Zubair expenses this month"), expenses in a stage ("rejected expenses"), attendance ("who is on duty today"), headcount, complaints, time off requests, fuel refills, the team, visitors, or find an amount ("find 18376"). Name a month, a year, an office or a head. I only know what is in the app.' : 'I am OpsBot. I answer from the data in OpsTrack that you can open: your cash in hand, advances, expenses and visitors.', suggestions: sugg };
  }
  const extra = await extraTopics(user, n, nowY, nowM, today);
  if (extra) return { reply: extra, suggestions: [] };
  if (has(n, /visitor|inside now|who is in\b|who is inside/)) return { reply: await visitorsAnswer(user, n, nowY, nowM, today), suggestions: [] };
  // A short follow-up ("and ISB?", "what about last year?") continues the last question.
  const follow = !!ctx && (has(n, /^(and|what about|how about|same|also|now|then|ok|okay|for|in)\b/) || n.split(' ').length <= 4);
  const money = (follow && ctx && ctx.intent) || has(n, /spend|spent|cost|expens|paid|how much|total|budget|variance|compare|versus|\bvs\b|head|office|isb|lhr|travel|rent|month|share|percent|top|biggest/);
  const pettyTopic = has(n, /cash in hand|cih|holding|who has|who holds|advance|outstanding|ready for accounts|awaiting|pending|waiting|approval|my cash|my expenses/);
  if (pettyTopic && !has(n, /budget|isb|lhr|head|month|compare|travel|rent/)) return { reply: await pettyAnswer(user, n), suggestions: [] };
  if (!om) {
    if (money) return { reply: await pettyAnswer(user, n), suggestions: sugg };
    return { reply: 'I did not understand that. You can ask about your cash in hand, advances, expenses waiting, or visitors.', suggestions: sugg };
  }
  if (!money) return { reply: 'I did not understand that. Try one of these, or name a month, year, head or office.', suggestions: sugg };

  // Sr. Ops Manager: expenditure analysis, with what was asked remembered for the next question
  const INTENTS = [['budget', /budget|variance|provision|over budget|under budget|left/], ['compare', /compare|versus|\bvs\b|year wise|year over year|yearly|previous year|last year/], ['monthly', /month wise|month by month|monthly|each month|by month|trend|per month|(highest|lowest|busiest|quietest|biggest) month/], ['heads', /top|biggest|highest|largest|most|head wise|by head|per head|each head|breakdown|categories/], ['split', /share|percent|%|split|office wise|by office/]];
  const said = (INTENTS.find(([, re]) => re.test(n)) || [])[0];
  const intent = said || (follow && ctx && ctx.intent) || 'spend';
  const w0 = when(n, nowY, nowM);
  const w = follow && ctx && !w0.explicit ? { year: ctx.year, from: ctx.from, to: ctx.to, label: ctx.label } : w0;
  const said2 = has(n, /\bisb\b|islamabad/) && !has(n, /\blhr\b|lahore/) ? 'ISB' : has(n, /\blhr\b|lahore/) && !has(n, /\bisb\b|islamabad/) ? 'LHR' : '';
  const office = said2 || (follow && ctx && !has(n, /both offices|all offices/) ? ctx.office : 'ALL');
  const exBB = has(n, /without boldbelief|excluding boldbelief|excl boldbelief|operational/) || (follow && ctx && ctx.exBB && !has(n, /with boldbelief/));
  const ccs = (await q("SELECT DISTINCT cost_center FROM pc2_er_entries WHERE cost_center <> ''")).map((r) => r.cost_center);
  const head = pickHead(n, ccs) || (follow && ctx && !has(n, /all heads|every head/) ? ctx.head : null);
  const f = { from: w.from, to: w.to, office, head, exBB };
  const where = (head ? ' on ' + head : '') + (office !== 'ALL' ? ' for ' + office : '') + (exBB ? ' (without BOLDBelief)' : '');
  const note = 'As booked: an entry with no office counts as LHR.';
  const rows = await officeCosts(w.year);
  const a = agg(rows, f);
  const ctxOut = { intent, year: w.year, from: w.from, to: w.to, label: w.label, office, head, exBB };
  const done = (reply, extra = []) => ({ reply: lines(reply, ...extra), suggestions: [], ctx: ctxOut });
  const sumBud = async () => {
    const bud = await budgetByHead(w.year);
    let B = 0;
    for (const [cc, arr] of Object.entries(bud)) {
      if (exBB && /^boldbelief/i.test(cc)) continue;
      if (head && cc !== head) continue;
      B += arr.slice(w.from - 1, w.to).reduce((x, y) => x + y, 0);
    }
    return B;
  };
  // Background lines for an answer: last year, the budget and the busiest month.
  const context = async (tot) => {
    const out = [];
    const prev = agg(await officeCosts(w.year - 1), f).tot;
    if (prev > 0) out.push('Same months in ' + (w.year - 1) + ': ' + pkr(prev) + ' (' + (tot >= prev ? 'up ' : 'down ') + pc(Math.abs(tot - prev), prev) + ').');
    const B = await sumBud();
    if (B > 0 && office === 'ALL') out.push('Budget for these months: ' + pkr(B) + ', ' + pc(tot, B) + ' used' + (tot > B ? ' (over by ' + pkr(tot - B) + ').' : ' (' + pkr(B - tot) + ' left).'));
    if (w.to > w.from) {
      let hi = w.from;
      for (let m = w.from; m <= w.to; m++) if (a.byMonth[m - 1] > a.byMonth[hi - 1]) hi = m;
      if (a.byMonth[hi - 1] > 0) out.push('Busiest month: ' + MONTHS[hi - 1] + ' (' + pkr(a.byMonth[hi - 1]) + ').');
    }
    return out;
  };

  if (intent === 'budget') {
    const B = await sumBud();
    const actual = agg(rows, { ...f, office: 'ALL' }).tot;
    return done('Budget ' + w.label + (head ? ' on ' + head : '') + (exBB ? ' (without BOLDBelief)' : '') + ':', ['Budgeted: ' + pkr(B), 'Spent (from the entries): ' + pkr(actual) + ' (' + pc(actual, B) + ' of the budget)', actual > B ? 'Over budget by ' + pkr(actual - B) + '.' : 'Left in budget: ' + pkr(B - actual) + '.', office !== 'ALL' ? 'The workbook has no budget per office, so this is for both offices.' : '', "The Budget vs Actual page uses the workbook's own figures for the months it has worked out, so small differences are possible."]);
  }
  if (intent === 'compare') {
    const ys = (await erYears()).slice(0, 4).sort((x, y) => x - y);
    const out = [];
    let prev = null;
    for (const yy of ys) {
      const tt = agg(yy === w.year ? rows : await officeCosts(yy), f).tot;
      if (tt > 0) {
        out.push('  ' + yy + ': ' + pkr(tt) + (prev ? ' (' + (tt >= prev ? '+' : '-') + pc(Math.abs(tt - prev), prev) + ' on the year before)' : ''));
        prev = tt;
      }
    }
    return done('Spend' + where + ', ' + MONTHS[w.from - 1] + ' to ' + MONTHS[w.to - 1] + ', year by year:', [...out, note]);
  }
  if (intent === 'monthly') {
    const ml = [];
    for (let m = w.from; m <= w.to; m++) ml.push('  ' + MON3[m - 1] + ': ' + pkr(a.byMonth[m - 1]));
    let hiM = w.from;
    let loM = w.from;
    for (let m = w.from; m <= w.to; m++) {
      if (a.byMonth[m - 1] > a.byMonth[hiM - 1]) hiM = m;
      if (a.byMonth[m - 1] < a.byMonth[loM - 1]) loM = m;
    }
    return done('Spend' + where + ' by month, ' + w.year + ':', [...ml, 'Total: ' + pkr(a.tot), w.to > w.from ? 'Highest: ' + MONTHS[hiM - 1] + ' (' + pkr(a.byMonth[hiM - 1]) + '). Lowest: ' + MONTHS[loM - 1] + ' (' + pkr(a.byMonth[loM - 1]) + ').' : '', ...(await context(a.tot)), note]);
  }
  if (intent === 'heads') {
    const top = has(n, /top|biggest|highest|largest|most/);
    const list = sortedHeads(a).slice(0, top ? 5 : 15);
    return done('Spend' + where + ', ' + w.label + (top ? ' (largest first)' : '') + ':', [...list.map(([k, v]) => '  ' + k + ': ' + pkr(v) + ' (' + pc(v, a.tot) + ')'), 'Total: ' + pkr(a.tot), note]);
  }
  if (intent === 'split') {
    const both = agg(rows, { ...f, office: 'ALL' });
    return done('Spend' + (head ? ' on ' + head : '') + (exBB ? ' (without BOLDBelief)' : '') + ', ' + w.label + ':', ['LHR: ' + pkr(both.lhr) + ' (' + pc(both.lhr, both.tot) + ')', 'ISB: ' + pkr(both.isb) + ' (' + pc(both.isb, both.tot) + ')', 'Total: ' + pkr(both.tot), ...(await context(both.tot)), note]);
  }
  const span = w.to - w.from + 1;
  const topHeads = head ? [] : sortedHeads(a).slice(0, 3);
  return done('Spend' + where + ', ' + w.label + ': ' + pkr(a.tot) + '.', [office === 'ALL' ? 'LHR ' + pkr(a.lhr) + ' (' + pc(a.lhr, a.tot) + '), ISB ' + pkr(a.isb) + ' (' + pc(a.isb, a.tot) + ').' : '', 'About ' + pkr(a.tot / Math.max(1, span)) + ' a month over ' + span + ' month(s).', topHeads.length ? 'Biggest heads: ' + topHeads.map(([k, v]) => k + ' ' + pkr(v)).join('; ') + '.' : '', ...(await context(a.tot)), note, 'You can ask a follow-up, for example "and for ISB?" or "what about last year?".']);
}
