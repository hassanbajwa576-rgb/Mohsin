'use client';

import { useState } from 'react';

// Category suggestions from the wording of the expense (the first match wins; the user can change it).
const GUESS = [
  [/food|tea|lunch|dinner|breakfast|refresh|snack|biscuit|milk|meal/i, 'Tea & Refreshments'],
  [/water|electric|gas|utility|utilities|internet|wifi|bill/i, 'Utilities'],
  [/tcs|courier|postage|post|dhl|leopard|delivery|parcel/i, 'Courier & Postage'],
  [/fuel|petrol|diesel|transport|taxi|careem|uber|travel|conveyance|ride/i, 'Transport & Fuel'],
  [/clean|supplies|detergent|soap|tissue|mop|janitor|housekeep|sweep|garbage/i, 'Cleaning & Maintenance'],
  [/repair|fix|plumb|electrician|paint|carpent/i, 'Repairs'],
  [/print|photocopy|toner|cartridge|scan/i, 'Printing'],
  [/stationery|paper|pen|file|folder|marker|stapler|register/i, 'Stationery'],
  [/welfare|medical|staff|gift|party|eid|bonus/i, 'Staff Welfare'],
];
const guess = (t) => {
  for (const [re, c] of GUESS) if (re.test(t)) return c;
  return 'Other';
};

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const two = (n) => String(n).padStart(2, '0');
function parseDate(t) {
  const x = String(t).trim();
  let m = x.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return x;
  m = x.match(/^(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ ,.]+(\d{4})$/);
  if (m && MON[m[2].slice(0, 3).toLowerCase()]) return m[3] + '-' + two(MON[m[2].slice(0, 3).toLowerCase()]) + '-' + two(m[1]);
  m = x.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + two(m[2]) + '-' + two(m[1]);
  return '';
}

function parseAmount(t) {
  const x = String(t).replace(/rs\.?/gi, '').replace(/pkr/gi, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(x)) return null;
  return Math.round(Number(x));
}

// Copied Excel cells are separated by tabs; a line typed by hand ("Tea 500") is also understood.
function parse(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let cells = raw.split('\t').map((c) => c.trim()).filter((c) => c !== '');
    if (cells.length < 2) {
      const m = line.match(/^(.*?)\s+(?:rs\.?\s*)?([\d,]+(?:\.\d+)?)$/i);
      cells = m ? [m[1].trim(), m[2]] : [line];
    }
    let amount = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      const a = parseAmount(cells[i]);
      if (a != null) {
        amount = a;
        cells = cells.filter((_, j) => j !== i);
        break;
      }
    }
    if (amount == null && /detail|amount|description|expense/i.test(line) && cells.length <= 3) continue;
    // Office and payment-mode cells (as copied from the Ops Expenses sheet) are picked out first.
    let o = '';
    cells = cells.filter((c) => {
      if (/^(isb|lhr)$/i.test(c)) { o = c.toUpperCase(); return false; }
      return !/^(petty cash|bank|cash|cheque|online)$/i.test(c);
    });
    // Sheet layout: Cost center - 7120 | Expense type | Detail. The detail is the third cell, the type helps the category guess.
    let type = '';
    if (cells.length >= 3 && /\s-\s\d{4}$/.test(cells[0])) {
      type = cells[1];
      cells = [cells[2]];
    }
    let on = '';
    let detail = '';
    for (const c of cells) {
      const d = parseDate(c);
      if (d && !on) on = d;
      else if (!detail && !/^(rs\.?|pkr)$/i.test(c)) detail = c;
    }
    out.push({ d: detail, a: amount == null ? '' : amount, c: guess(type + ' ' + detail), on, o });
  }
  return out.slice(0, 200);
}

export default function PasteExpenses({ action, isSO, isOM, officeCode, advances, funds, categories, today }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const total = rows.reduce((a, r) => a + (Number(r.a) > 0 ? Number(r.a) : 0), 0);
  const bad = rows.filter((r) => !(Number(r.a) > 0)).length;

  return (
    <form
      action={action}
      className='paste'
      onSubmit={(e) => {
        if (rows.length === 0) {
          e.preventDefault();
          setErr('Paste your rows first');
        } else if (bad > 0) {
          e.preventDefault();
          setErr('Fix or remove the rows marked in red first');
        }
      }}
    >
      <p className='muted'>In Excel select your rows (the full sheet columns Cost Center to Office also work), copy (Ctrl+C), click the box below and paste (Ctrl+V). An Office column (ISB / LHR) is picked up per row; "Rs" and payment mode are ignored.</p>
      <textarea
        rows={5}
        value={text}
        placeholder={'Emp-ees regular food\t917\nGeneral and Cleaning Supplies\t14,895'}
        onChange={(e) => {
          setText(e.target.value);
          setRows(parse(e.target.value));
          setErr('');
        }}
      />
      <div className='form'>
        <label>Date (for rows without a date)<input type='date' name='spent_on' defaultValue={today} required /></label>
        {isSO ? (
          <label>Paid from advance
            <select name='issue_id' required>
              {advances.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
        ) : (
          <label>Paid from fund
            <select name='fund' defaultValue='petty'>{funds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
        )}
        {!isSO ? (
          <label>Office (for rows without one)
            <select name='office' defaultValue={officeCode}><option>LHR</option><option>ISB</option></select>
          </label>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className='tablewrap'>
          <table>
            <thead><tr><th>#</th><th>Expense detail</th><th>Category</th><th>Date</th><th>Office</th><th className='r'>Amount</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={Number(r.a) > 0 ? '' : 'conflict'}>
                  <td>{i + 1}</td>
                  <td><input value={r.d} onChange={(e) => set(i, { d: e.target.value, c: guess(e.target.value) })} /></td>
                  <td>
                    <select value={r.c} onChange={(e) => set(i, { c: e.target.value })}>
                      {categories.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className='nw'>{r.on || 'as above'}</td>
                  <td>{isSO ? 'yours' : <select value={r.o} onChange={(e) => set(i, { o: e.target.value })}><option value=''>as above</option><option>LHR</option><option>ISB</option></select>}</td>
                  <td className='r'><input type='number' min='1' step='1' value={r.a} onChange={(e) => set(i, { a: e.target.value })} className='sm' /></td>
                  <td><button type='button' className='btn ghost' onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <input type='hidden' name='rows' value={JSON.stringify(rows.map((r) => ({ d: r.d, a: Number(r.a), c: r.c, on: r.on, o: r.o })))} />
      {err ? <p className='att-err'>{err}</p> : null}
      <p className='totals'>{rows.length} row(s) - total PKR {total.toLocaleString('en-US')}{bad ? ' - ' + bad + ' row(s) need an amount' : ''}</p>
      <button className='btn primary' type='submit' disabled={rows.length === 0}>{'Add ' + (rows.length || '') + ' expenses'}</button>
    </form>
  );
}
