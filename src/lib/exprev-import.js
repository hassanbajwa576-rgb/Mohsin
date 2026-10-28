import JSZip from 'jszip';

// Reads the Ops Expenses Dashboard workbook (.xlsm / .xlsx) without loading every sheet:
// only the four visible sheets are opened, straight from the file's XML.

const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;|&#xA;/gi, ' ').replace(/&amp;/g, '&');
const colNum = (s) => s.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
const iso = (serial) => new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000).toISOString().slice(0, 10);

function sharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
}

// rows: Map(rowNumber -> Map(columnNumber -> { v, f }))
function readSheet(xml, ss) {
  const rows = new Map();
  for (const r of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (!c[3]) continue;
      const raw = (c[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const f = (c[3].match(/<f[^>]*>([\s\S]*?)<\/f>/) || [])[1];
      let v;
      if (raw !== undefined) v = /t="s"/.test(c[2]) ? ss[Number(raw)] : /t="(str|e)"/.test(c[2]) ? dec(raw) : Number(raw);
      else if (/t="inlineStr"/.test(c[2])) v = dec([...c[3].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      if (v === undefined && f === undefined) continue;
      cells.set(colNum(c[1]), { v, f: f === undefined ? undefined : dec(f) });
    }
    rows.set(Number(r[1]), cells);
  }
  return rows;
}

const text = (rows, r, c) => {
  const x = rows.get(r) && rows.get(r).get(c);
  return x && typeof x.v === 'string' ? x.v : '';
};
const num = (rows, r, c) => {
  const x = rows.get(r) && rows.get(r).get(c);
  return x && typeof x.v === 'number' && Number.isFinite(x.v) ? x.v : 0;
};
const FIELD = /Expenditures\[(COST CENTER|EXPENSE TYPE)\]\s*,\s*"=([^"]*)"/;
const fieldOf = (f) => {
  const m = f && FIELD.exec(f.replace(/\s+/g, ' '));
  return m ? { field: m[1] === 'COST CENTER' ? 'cc' : 'et', match: m[2].trim() } : null;
};

export async function readWorkbook(buf) {
  const zip = await JSZip.loadAsync(buf);
  const file = async (p) => {
    const f = zip.file(p);
    if (!f) throw new Error('This does not look like the Ops Expenses Dashboard file.');
    return f.async('string');
  };
  const wb = await file('xl/workbook.xml');
  const rels = await file('xl/_rels/workbook.xml.rels');
  const target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/\bId="([^"]*)"/) || [])[1];
    const t = (m[0].match(/\bTarget="([^"]*)"/) || [])[1];
    if (id && t) target[id] = t.replace(/^\/?(xl\/)?/, 'xl/');
  }
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: dec((m[0].match(/\bname="([^"]*)"/) || [])[1] || '').trim(),
    hidden: /\bstate="(hidden|veryHidden)"/.test(m[0]),
    path: target[(m[0].match(/\br:id="([^"]*)"/) || [])[1]],
  }));
  const ss = sharedStrings(await file('xl/sharedStrings.xml'));
  const open = async (s) => readSheet(await file(s.path), ss);
  const visible = sheets.filter((s) => !s.hidden && s.path);
  const byName = (re) => visible.filter((s) => re.test(s.name.toLowerCase()));
  const yearOf = (s) => Number((s.name.match(/(20\d\d)/) || [])[1]) || 0;
  const latest = (list) => list.sort((a, b) => yearOf(b) - yearOf(a))[0];

  const expSheet = byName(/^expenditures/)[0];
  const dashSheet = byName(/^dashboard/)[0];
  if (!expSheet || !dashSheet) throw new Error('The Dashboard and Expenditures sheets were not found in this file.');

  // ---- every expenditure row
  const ex = await open(expSheet);
  const entries = [];
  for (const [r, cells] of ex) {
    if (r < 4) continue;
    const d = cells.get(2);
    const a = cells.get(6);
    if (!d || typeof d.v !== 'number' || !a || typeof a.v !== 'number' || !a.v) continue;
    entries.push({
      d: iso(d.v),
      cc: text(ex, r, 3).trim(),
      et: text(ex, r, 4).trim(),
      de: text(ex, r, 5).trim(),
      a: Math.round(a.v * 100) / 100,
      pm: text(ex, r, 7).trim(),
      of: text(ex, r, 8).trim(),
      ve: text(ex, r, 9).trim(),
      re: text(ex, r, 10).trim(),
    });
  }

  // ---- dashboard rows: a cost centre, or an expense type shown beneath it
  const da = await open(dashSheet);
  const dash = [];
  const seen = new Set();
  let totals = 0;
  for (let r = 9; r <= 200; r++) {
    const label = text(da, r, 2).trim();
    // The sheet shows a subtotal, then the advances and tax rows, then the final total.
    if (/^total expenses/i.test(label)) {
      if (++totals >= 2) break;
      continue;
    }
    if (!label || seen.has(label)) continue;
    let hit = null;
    for (let c = 3; c <= 14 && !hit; c++) hit = fieldOf(da.get(r) && da.get(r).get(c) && da.get(r).get(c).f);
    if (!hit) continue;
    seen.add(label);
    dash.push({ label, field: hit.field, match: hit.match, grp: totals ? 1 : 0 });
  }

  // ---- consolidated profit and loss (latest year): this is where the monthly budget lives
  let pnl = null;
  let pRows = null;
  const ps = latest(byName(/^consl\. p&l fy-/));
  if (ps) {
    pRows = await open(ps);
    const rows = pRows;
    const out = [];
    for (let r = 6; r <= 400; r++) {
      const raw = text(rows, r, 1);
      const label = raw.trim();
      if (!label) continue;
      const vals = [];
      let any = false;
      for (let m = 0; m < 12; m++) {
        const c = rows.get(r) && rows.get(r).get(2 + m);
        const v = c && typeof c.v === 'number' ? c.v : null;
        if (v !== null) any = true;
        vals.push(v);
      }
      out.push({ label, level: Math.min(3, Math.floor((raw.length - raw.trimStart().length) / 3)), kind: /^(total |gross profit|net )/i.test(label) ? 'total' : any ? 'line' : 'head', vals });
    }
    pnl = { year: yearOf(ps) || 0, title: [text(rows, 1, 1), text(rows, 2, 1), text(rows, 3, 1)].filter(Boolean), rows: out };
  }

  // ---- budget against actual (latest year). Each month has a block of four columns (budget, actual, QuickBooks, variance)
  // that is only filled up to the last closed month, so the budget for every month is read from the P&L row the first month points at.
  let bva = null;
  const bs = latest(byName(/^bh vs ah fy/));
  if (bs) {
    const rows = await open(bs);
    const year = new Date(iso(num(rows, 1, 3) || 0)).getUTCFullYear() || yearOf(bs);
    const BLOCKS = 9;
    const lines = [];
    let grand = false;
    for (let r = 3; r <= 200; r++) {
      const label = text(rows, r, 2).trim();
      if (!label) continue;
      if (/^total budgeted/i.test(label)) {
        if (grand) break;
        grand = true;
        lines.push({ row: r, label: 'Total Budgeted', kind: 'grand', b: [], q: [] });
        continue;
      }
      const cellD = rows.get(r) && rows.get(r).get(4);
      const f = cellD && cellD.f;
      const cellC = rows.get(r) && rows.get(r).get(3);
      const ref = cellC && cellC.f && /P&L[^!]*'!\$?B\$?(\d+)$/.exec(cellC.f.trim());
      const b = [];
      const q = [];
      for (let m = 0; m < 12; m++) {
        const fromP = ref && pRows ? num(pRows, Number(ref[1]), 2 + m) : null;
        b.push(fromP !== null ? fromP : m < BLOCKS ? num(rows, r, 3 + 4 * m) : 0);
        q.push(m < BLOCKS ? num(rows, r, 5 + 4 * m) : 0);
      }
      // Rows that only started to be used later in the year have their formula in a later month's block.
      let hit = fieldOf(f);
      for (let m = 1; !hit && !f && m < 12; m++) {
        const cm = rows.get(r) && rows.get(r).get(4 + 4 * m);
        if (cm && cm.f) hit = fieldOf(cm.f);
      }
      const sum = f && /^SUM\(D(\d+):D(\d+)\)$/.exec(f.replace(/\s+/g, ''));
      if (hit) lines.push({ row: r, label, kind: 'line', field: hit.field, match: hit.match, b, q });
      else if (sum) lines.push({ row: r, label, kind: 'total', rng: [Number(sum[1]), Number(sum[2])], b: [], q: [] });
      else lines.push({ row: r, label, kind: 'head', b, q });
    }
    bva = { year, lines };
  }
  if (pnl && !pnl.year && bva) pnl.year = bva.year;

  return { entries, dash, bva, pnl };
}
