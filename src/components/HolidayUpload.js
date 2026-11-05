'use client';

import { useState } from 'react';
import { parseHolidays } from '@/lib/holiday-parse';
import { importHolidays } from '@/lib/holiday-actions';

// Reads a government holiday notification (scanned or text PDF, or a photo) in the browser, lists the holidays it finds, and lets the
// Sr. Ops Manager tick the public ones before saving. The file never leaves this device; only the ticked holidays are saved.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFWORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function loadScript(src, ready) {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    let s = document.querySelector('script[src="' + src + '"]');
    if (!s) {
      s = document.createElement('script');
      s.src = src;
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Could not load a helper from the internet. Check the connection and try again.')));
  });
}

// Lines of a text PDF page, rebuilt from the position of each piece of text.
function pageLines(items) {
  const rows = new Map();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 4);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(it);
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(' ')).join('\n');
}

export default function HolidayUpload({ year }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [rows, setRows] = useState(null);
  const [raw, setRaw] = useState('');

  async function ocr(canvasOrFile, note) {
    setBusy(note + ' (the first time this downloads the reading helper, about 10 MB)');
    await loadScript(TESS, () => !!window.Tesseract);
    const worker = await window.Tesseract.createWorker('eng');
    const r = await worker.recognize(canvasOrFile);
    await worker.terminate();
    return r.data.text;
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErr('');
    setRows(null);
    try {
      let text = '';
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        setBusy('Opening the PDF');
        await loadScript(PDFJS, () => !!window.pdfjsLib);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFWORKER;
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) {
          const page = await pdf.getPage(p);
          let t = pageLines((await page.getTextContent()).items);
          if (t.replace(/\s/g, '').length < 80) {
            const vp = page.getViewport({ scale: 2.2 });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            t = await ocr(canvas, 'Reading page ' + p + ' of the scan');
          }
          text += '\n' + t;
        }
      } else {
        text = await ocr(file, 'Reading the picture');
      }
      setRaw(text);
      const list = parseHolidays(text, year).map((h) => ({ ...h, keep: !h.optional }));
      if (!list.length) setErr('No holidays were found in this file for ' + year + '. Check the year above, or add them by hand.');
      setRows(list);
    } catch (x) {
      setErr(String((x && x.message) || x));
    } finally {
      setBusy('');
    }
  }

  const set = (i, patch) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const kept = rows ? rows.filter((r) => r.keep) : [];

  return (
    <div>
      <label className='wide'>Government notification (PDF, scan or photo)
        <input type='file' accept='application/pdf,image/*' onChange={onFile} disabled={!!busy} />
      </label>
      {busy ? <p className='muted'>{busy}...</p> : null}
      {err ? <p className='neg-t'>{err}</p> : null}
      {rows && rows.length ? (
        <form action={importHolidays}>
          <p className='muted'>Found {rows.length} holidays for {year}. Public holidays are ticked; optional and bank-only days are left out. Fix any name or date that was read wrongly, then save.</p>
          <div className='tablewrap'>
            <table className='tx'>
              <thead><tr><th></th><th>Date</th><th>Holiday</th><th>Type</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><input type='checkbox' checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} /></td>
                    <td><input type='date' value={r.day} onChange={(e) => set(i, { day: e.target.value })} /></td>
                    <td className='c-title'><input value={r.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} /></td>
                    <td><span className={'tk-own ' + (r.kind === 'public' ? 'tk-from' : '')}>{r.kind === 'public' ? 'Public' : r.kind === 'bank' ? 'Banks only' : 'Optional'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <input type='hidden' name='year' value={year} />
          <input type='hidden' name='rows' value={JSON.stringify(kept.map((r) => ({ day: r.day, name: r.name })))} />
          <p><button className='btn primary' type='submit' disabled={!kept.length}>Add {kept.length} holidays to the calendar</button></p>
        </form>
      ) : null}
      {raw ? <details><summary className='muted'>Show the text that was read</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{raw}</pre></details> : null}
    </div>
  );
}
