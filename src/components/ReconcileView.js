'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { saveDay, markReviewed, markReviewedMany } from '@/lib/att-actions';

const KIND = { in: 'Check In', out: 'Check Out', break_out: 'Break Out', break_in: 'Break In' };
const PK = 'Asia/Karachi';
const dateOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: PK, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const timeOf = (ms) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: PK, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const h = p.find((x) => x.type === 'hour').value;
  return (h === '24' ? '00' : h) + ':' + p.find((x) => x.type === 'minute').value;
};

const SECTIONS = [
  ['long', 'Shifts over 16 hours', 'Usually a mixed up AM and PM. Press Review to correct the times, or Mark reviewed if they are right.'],
  ['noout', 'Check in with no check out', 'Fine for staff who do not need a check out (for example on Saturdays): press Mark reviewed. Otherwise press Review to add the check out.'],
  ['misfit', 'Entries that do not fit together', 'For example two check ins in a row, or a break that never ended. Press Review to fix them.'],
];

// One line per entry, in time order, plus empty slots for a missing check in or check out.
function linesFor(it) {
  const lines = it.entries.map((e) => ({ id: e.id, kind: e.kind, date: dateOf(e.ms), time: timeOf(e.ms), was: { kind: e.kind, date: dateOf(e.ms), time: timeOf(e.ms) }, del: false }));
  if (!lines.some((l) => l.kind === 'in')) lines.unshift({ id: null, kind: 'in', date: it.day, time: '', del: false });
  if (!lines.some((l) => l.kind === 'out')) lines.push({ id: null, kind: 'out', date: it.day, time: '', del: false });
  return lines;
}

export default function ReconcileView({ initial }) {
  const [lists, setLists] = useState(initial);
  const [open, setOpen] = useState(null); // { item, lines }
  const [saved, setSaved] = useState([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [popErr, setPopErr] = useState('');
  const [busy, start] = useTransition();
  const [lastKey, setLastKey] = useState('');
  // Run an action and put the page back exactly where it was, so the list never jumps.
  const keepScroll = (fn) => start(async () => {
    const y = window.scrollY;
    await fn();
    requestAnimationFrame(() => window.scrollTo(0, y));
  });
  const key = (it) => it.staff + '|' + it.day + '|' + it.kind + '|' + it.sig;

  const drop = (keys) => setLists((l) => Object.fromEntries(Object.entries(l).map(([s, arr]) => [s, arr.filter((it) => !keys.includes(key(it)))])));

  function openReview(it) {
    setPopErr('');
    setOpen({ item: it, lines: linesFor(it) });
  }
  const setLine = (i, patch) => setOpen((o) => ({ ...o, lines: o.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  function save() {
    const it = open.item;
    const changes = open.lines
      .filter((l) => l.id && !l.del && l.time && (l.kind !== l.was.kind || l.date !== l.was.date || l.time !== l.was.time))
      .map((l) => ({ id: l.id, kind: l.kind, date: l.date, time: l.time }));
    const removes = open.lines.filter((l) => l.id && (l.del || !l.time)).map((l) => l.id);
    const adds = open.lines.filter((l) => !l.id && l.time && !l.del).map((l) => ({ kind: l.kind, date: l.date, time: l.time }));
    if (!changes.length && !removes.length && !adds.length) {
      setPopErr('Nothing was changed');
      return;
    }
    keepScroll(async () => {
      const r = await saveDay({ staff: it.staff, day: it.day, changes, removes, adds });
      if (r && r.ok) {
        setLists((l) => ({ ...l, [it.kind]: l[it.kind].map((x) => (key(x) === key(it) ? { ...x, entries: r.entries } : x)) }));
        setSaved((s) => [...s, key(it)]);
        setLastKey(key(it));
        setOpen(null);
        setPopErr('');
        setNote('Saved for ' + it.name + ' ' + it.day + '. Check it, then press Mark reviewed.');
      } else setPopErr((r && r.error) || 'Could not save');
    });
  }

  function review(it) {
    keepScroll(async () => {
      const r = await markReviewed({ staff: it.staff, day: it.day, kind: it.kind, sig: it.sig });
      if (r && r.ok) {
        drop([key(it)]);
        setNote(it.name + ' ' + it.day + ' marked as reviewed.');
        setErr('');
      } else setErr('Could not mark that as reviewed');
    });
  }

  function reviewAll(list) {
    keepScroll(async () => {
      const items = list.slice(0, 300).map((it) => ({ staff: it.staff, day: it.day, kind: it.kind, sig: it.sig }));
      const r = await markReviewedMany(items);
      if (r && r.ok) {
        drop(list.slice(0, 300).map(key));
        setNote(r.n + ' marked as reviewed.');
        setErr('');
      } else setErr('Nothing to mark');
    });
  }

  return (
    <>
      {note ? <p className='okline'>{note}</p> : null}
      {err ? <p className='badline'>{err}</p> : null}
      {SECTIONS.map(([k, title, text]) => {
        const list = lists[k] || [];
        return (
          <div className='card' key={k}>
            <h3 style={{ marginTop: 0 }}>{title} ({list.length})</h3>
            <p className='muted'>{text}</p>
            {list.length ? (
              <>
                <div className='tablewrap'>
                  <table className='tx'>
                    <thead><tr><th>Employee</th><th>Date</th><th>What</th><th></th></tr></thead>
                    <tbody>
                      {list.slice(0, 300).map((it) => (
                        <tr key={key(it)} className={lastKey === key(it) ? 'justdone' : ''}>
                          <td className='c-title'><span className='pill'>{it.office}</span> <b>{it.name}</b></td>
                          <td className='nw c-meta'>{it.day}</td>
                          <td className='c-meta'>{it.text}{saved.includes(key(it)) ? <div className='impok'>Saved - check it, then mark reviewed</div> : null}</td>
                          <td className='act'>
                            <button type='button' className='btn' disabled={busy} onClick={() => openReview(it)}>Review</button>
                            <button type='button' className='btn primary' disabled={busy} onClick={() => review(it)}>Mark reviewed</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ marginTop: 10 }}>
                  <button type='button' className='btn' disabled={busy} onClick={() => reviewAll(list)}>Mark all {Math.min(list.length, 300)} shown as reviewed</button>
                </p>
              </>
            ) : <p className='muted'>Nothing to review here.</p>}
          </div>
        );
      })}

      {open ? (
        <div className='modalbg' onClick={() => setOpen(null)}>
          <div className='modalbox' role='dialog' aria-label='Review entries' onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>{open.item.name}, {open.item.day}</h3>
            <p className='muted' style={{ margin: '4px 0 8px' }}>Change a time, fill in a missing one, or delete a wrong entry. Then press Save changes.</p>
            {open.lines.map((l, i) => (
              <div className={'modalline' + (l.del ? ' gone' : '')} key={(l.id || 'n') + '-' + i}>
                <select value={l.kind} disabled={l.del} onChange={(e) => setLine(i, { kind: e.target.value })}>
                  {Object.entries(KIND).map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
                </select>
                <input type='date' value={l.date} disabled={l.del} onChange={(e) => setLine(i, { date: e.target.value })} />
                <input type='time' value={l.time} disabled={l.del} onChange={(e) => setLine(i, { time: e.target.value })} placeholder='Time' />
                <button type='button' className='btn ghost' onClick={() => setLine(i, { del: !l.del })}>{l.del ? 'Undo' : 'Delete'}</button>
              </div>
            ))}
            <p style={{ margin: '6px 0' }}>
              <button type='button' className='linkbtn' onClick={() => setOpen((o) => ({ ...o, lines: [...o.lines, { id: null, kind: 'break_out', date: o.item.day, time: '', del: false }] }))}>+ Add entry</button>
              <span className='muted'> An empty time line is ignored; clearing the time of an existing entry deletes it.</span>
            </p>
            {popErr ? <p className='badline'>{popErr}</p> : null}
            <div className='imppopbtn'>
              <button type='button' className='btn primary' disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save changes'}</button>
              <button type='button' className='btn' onClick={() => setOpen(null)}>Cancel</button>
              <Link className='muted recentlink' href={'/attendance/logs?date=' + open.item.day + '&emp=' + encodeURIComponent(open.item.name)}>Open in Day log</Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
