'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { fixEntry, markReviewed, markReviewedMany } from '@/lib/att-actions';

const KIND = { in: 'Check In', out: 'Check Out', break_out: 'Break Out', break_in: 'Break In' };
const PK = 'Asia/Karachi';
const dateOf = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: PK, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const timeOf = (ms) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: PK, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  return (p.find((x) => x.type === 'hour').value === '24' ? '00' : p.find((x) => x.type === 'hour').value) + ':' + p.find((x) => x.type === 'minute').value;
};

const SECTIONS = [
  ['long', 'Shifts over 16 hours', 'Usually a mixed up AM and PM. Fix the time here, or mark it reviewed if it is right.'],
  ['noout', 'Check in with no check out', 'Fine for staff who do not need a check out (for example on Saturdays). Mark those as reviewed.'],
  ['misfit', 'Entries that do not fit together', 'For example two check ins in a row, or a break that never ended. Fix or delete them here.'],
];

// The reconciliation lists. Everything happens on this page: change an entry in the popup, delete it, or mark the item
// reviewed, and the list updates in place.
export default function ReconcileView({ initial }) {
  const [lists, setLists] = useState(initial);
  const [edit, setEdit] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();
  const key = (it) => it.staff + '|' + it.day + '|' + it.kind + '|' + it.sig;

  const drop = (k, kinds) => setLists((l) => Object.fromEntries(Object.entries(l).map(([s, arr]) => [s, arr.filter((it) => !k.includes(key(it)) || (kinds && !kinds.includes(it.kind)))])));

  function openEdit(it, e) {
    setErr('');
    setEdit({ item: key(it), id: e.id, kind: e.kind, date: dateOf(e.ms), time: timeOf(e.ms) });
  }

  function afterFix(it, r, what) {
    if (!r || !r.ok) {
      setErr((r && r.error) || 'Could not save');
      return;
    }
    setEdit(null);
    setErr('');
    if (!r.flagged[it.kind]) {
      setLists((l) => ({ ...l, [it.kind]: l[it.kind].filter((x) => key(x) !== key(it)) }));
      setNote(what + '. ' + it.name + ' ' + it.day + ' is fixed and removed from the list.');
    } else {
      setLists((l) => ({ ...l, [it.kind]: l[it.kind].map((x) => (key(x) === key(it) ? { ...x, entries: r.entries } : x)) }));
      setNote(what + '. ' + it.name + ' ' + it.day + ' still needs a look.');
    }
  }

  function save(it) {
    start(async () => afterFix(it, await fixEntry({ id: edit.id, day: it.day, kind: edit.kind, date: edit.date, time: edit.time }), 'Saved'));
  }

  function remove(it, e) {
    if (!window.confirm('Delete this ' + KIND[e.kind] + ' entry? This cannot be undone.')) return;
    start(async () => afterFix(it, await fixEntry({ id: e.id, day: it.day, remove: true }), 'Deleted'));
  }

  function review(it) {
    start(async () => {
      const r = await markReviewed({ staff: it.staff, day: it.day, kind: it.kind, sig: it.sig });
      if (r && r.ok) {
        drop([key(it)]);
        setNote(it.name + ' ' + it.day + ' marked as reviewed.');
      } else setErr('Could not mark that as reviewed');
    });
  }

  function reviewAll(list) {
    start(async () => {
      const items = list.slice(0, 300).map((it) => ({ staff: it.staff, day: it.day, kind: it.kind, sig: it.sig }));
      const r = await markReviewedMany(items);
      if (r && r.ok) {
        drop(list.slice(0, 300).map(key));
        setNote(r.n + ' marked as reviewed.');
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
                      {list.slice(0, 300).flatMap((it) => [
                        <tr key={key(it)}>
                          <td className='c-title'><span className='pill'>{it.office}</span> <b>{it.name}</b></td>
                          <td className='nw c-meta'>{it.day}</td>
                          <td className='c-meta'>{it.text}</td>
                          <td className='act'>
                            <button type='button' className='btn primary' disabled={busy} onClick={() => review(it)}>Mark reviewed</button>
                          </td>
                        </tr>,
                        <tr key={key(it) + 'e'}>
                          <td colSpan={4} className='recent'>
                            {it.entries.map((e) => (
                              <span className='recentry' key={e.id}>
                                <b>{KIND[e.kind]} {timeOf(e.ms)}{dateOf(e.ms) !== it.day ? ' (next day)' : ''}</b>
                                <button type='button' className='btn' onClick={() => openEdit(it, e)}>Edit</button>
                                <button type='button' className='btn ghost' disabled={busy} onClick={() => remove(it, e)}>Delete</button>
                              </span>
                            ))}
                            {edit && edit.item === key(it) ? (
                              <div className='imppop'>
                                <b>Change this entry</b>
                                <label className='imppoprow'><span>Type</span>
                                  <select value={edit.kind} onChange={(ev) => setEdit({ ...edit, kind: ev.target.value })}>
                                    {Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                </label>
                                <label className='imppoprow'><span>Date</span><input type='date' value={edit.date} onChange={(ev) => setEdit({ ...edit, date: ev.target.value })} /></label>
                                <label className='imppoprow'><span>Time</span><input type='time' value={edit.time} onChange={(ev) => setEdit({ ...edit, time: ev.target.value })} /></label>
                                <div className='imppopbtn'>
                                  <button type='button' className='btn primary' disabled={busy} onClick={() => save(it)}>{busy ? 'Saving...' : 'Save'}</button>
                                  <button type='button' className='btn' onClick={() => setEdit(null)}>Cancel</button>
                                </div>
                              </div>
                            ) : null}
                            <Link className='muted recentlink' href={'/attendance/logs?date=' + it.day + '&emp=' + encodeURIComponent(it.name)}>Open in Day log</Link>
                          </td>
                        </tr>,
                      ])}
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
    </>
  );
}
