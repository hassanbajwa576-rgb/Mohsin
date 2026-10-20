'use client';

import { useActionState, useState, useTransition } from 'react';
import { previewImport, confirmImport, saveAppTimes } from '@/lib/att-actions';

const CHOICES = [
  ['keep', 'Keep what is in the app'],
  ['replace', 'Use the Excel times'],
];
const KIND = { in: 'Check in', out: 'Check out', break_out: 'Break out', break_in: 'Break in' };

// Step 1: choose the file(s) and dates. Step 2: review what will happen, decide every conflict, then import.
// A day whose times differ can be fixed right here: click the app times, change them and save.
export default function ImportExcel({ from, to }) {
  const [state, run, busy] = useActionState(previewImport, null);
  const plan = state && state.plan;
  const [choice, setChoice] = useState({});
  const [fix, setFix] = useState({});
  const [edit, setEdit] = useState(null);
  const [saving, startSave] = useTransition();
  const [seen, setSeen] = useState(null);
  if (plan && seen !== plan) {
    setSeen(plan);
    setChoice({});
    setFix({});
    setEdit(null);
  }
  const rows = plan ? plan.conflicts.map((c) => ({ ...c, ...(fix[c.key] || {}) })) : [];
  const open = rows.filter((c) => !c.done && !choice[c.key]).length;
  const differing = rows.filter((c) => !c.done).length;
  const nothing = plan && !plan.fresh && !plan.conflicts.length && !plan.same;

  function openEdit(c) {
    setEdit({ key: c.key, vals: Object.fromEntries(c.entries.map((e) => [e.id, e.t])), err: '' });
  }

  function save(c) {
    const changes = c.entries.filter((e) => edit.vals[e.id] && edit.vals[e.id] !== e.t).map((e) => ({ id: e.id, t: edit.vals[e.id] }));
    if (!changes.length) {
      setEdit({ ...edit, err: 'Change a time first' });
      return;
    }
    const item = plan.items.find((i) => i.key === c.key);
    startSave(async () => {
      const r = await saveAppTimes({ item, changes });
      if (r && r.ok) {
        setFix((f) => ({ ...f, [c.key]: { app: r.app, reasons: r.reasons, entries: r.entries, done: r.matches } }));
        setEdit(null);
      } else {
        setEdit((e) => ({ ...e, err: (r && r.error) || 'Could not save' }));
      }
    });
  }

  return (
    <>
      <form action={run} className='card form'>
        <label className='wide'>Attendance sheet (check in and check out)
          <input type='file' name='att' accept='.xlsx' />
        </label>
        <label className='wide'>Break timing sheet (optional)
          <input type='file' name='brk' accept='.xlsx' />
        </label>
        <label>From<input type='date' name='from' defaultValue={from} required /></label>
        <label>To<input type='date' name='to' defaultValue={to} required /></label>
        <p className='muted wide'>Employees are matched by name to your Employees list and entered in their own office. Each file may be up to 3 MB; the sheet for the month of each date is used.</p>
        {state && state.error ? <p className='badline wide'>{state.error}</p> : null}
        <button className='btn primary' type='submit' disabled={busy}>{busy ? 'Reading the file...' : 'Read the file and show a preview'}</button>
      </form>

      {plan ? (
        <form action={confirmImport} className='card form'>
          <input type='hidden' name='payload' value={JSON.stringify(plan.items)} />
          <input type='hidden' name='notes' value={JSON.stringify({ unmatched: plan.unmatched, problems: plan.problems })} />
          <input type='hidden' name='from' value={plan.from} />
          <input type='hidden' name='to' value={plan.to} />
          {rows.map((c) => (
            <input key={c.key} type='hidden' name={'c:' + c.key} value={choice[c.key] || ''} />
          ))}

          <h3 className='wide' style={{ margin: 0 }}>Preview: {plan.from} to {plan.to}</h3>
          <div className='wide impsum'>
            <div><b>{plan.fresh}</b><span>employee-days get missing entries added ({plan.freshEntries} entries)</span></div>
            <div><b>{plan.same + rows.filter((c) => c.done).length}</b><span>already match the app: nothing to do</span></div>
            <div><b>{differing}</b><span>have different times: your review needed</span></div>
            <div><b>{plan.unmatched.length}</b><span>names not matched</span></div>
            <div><b>{plan.problems.length}</b><span>rows skipped</span></div>
          </div>
          {plan.long && plan.long.length ? (
            <div className='wide implong'>
              <b>Check these times in the Excel file ({plan.long.length}): the shift is over 16 hours, which usually means AM and PM were mixed up.</b>
              <ul>{plan.long.map((l) => <li key={l.name + l.date}>{l.name} {l.date}: {l.text}</li>)}</ul>
            </div>
          ) : null}
          {plan.noOut ? <p className='muted wide'><b>{plan.noOut}</b> of the new days have a check in but no check out on the sheet. They are added as present and show 'no check out' in reports, with no worked hours.</p> : null}
          {plan.days.length ? <p className='muted wide'>New days: {plan.days.map(([d, n]) => d.slice(5) + ' (' + n + ')').join(' | ')}</p> : null}

          {rows.length ? (
            <div className='wide'>
              <h4 style={{ margin: '4px 0' }}>Times that differ from the app: choose for each</h4>
              <p className='muted'>Times that match are left alone and missing times (for example a check out) are added automatically. To correct the app's times here, click them. Days you do not settle now stay on the Needs review list on this page.
                {' '}
                <button type='button' className='linkbtn' onClick={() => setChoice(Object.fromEntries(rows.map((c) => [c.key, 'keep'])))}>Keep the app entries for all</button>
              </p>
              <div className='tablewrap'>
                <table className='tx tiles'>
                  <thead><tr><th>Employee</th><th>Date</th><th>In the app</th><th>In the Excel file</th><th>What differs</th><th>What to do</th></tr></thead>
                  <tbody>
                    {rows.flatMap((c) => {
                      const line = (
                        <tr key={c.key} className={c.done ? 'impdone' : choice[c.key] ? '' : 'impwait'}>
                          <td className='c-title'><b>{c.name}</b></td>
                          <td className='nw c-meta'>{c.date}</td>
                          <td className='c-meta'>
                            {c.entries && c.entries.length
                              ? <button type='button' className='linkbtn impedit' title='Change the app times' onClick={() => openEdit(c)}>{c.app}</button>
                              : c.app}
                          </td>
                          <td className='c-meta'><span className='xl'>{c.excel}</span></td>
                          <td className='c-meta'>
                            {c.done ? <span className='impok'>Updated - now matches</span> : <ul className='impwhy'>{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                          </td>
                          <td className='impchoice'>
                            {c.done ? <span className='muted'>Nothing more to do</span> : CHOICES.map(([v, label]) => (
                              <label key={v} className='checkrow'>
                                <input type='radio' name={'pick-' + c.key} checked={choice[c.key] === v} onChange={() => setChoice({ ...choice, [c.key]: v })} /> {c.breaksOnly && v === 'replace' ? 'Use the Excel breaks' : label}
                              </label>
                            ))}
                          </td>
                        </tr>
                      );
                      if (!edit || edit.key !== c.key) return [line];
                      return [line, (
                        <tr key={c.key + '-edit'} className='impeditrow'>
                          <td colSpan={6}>
                            <div className='imppop'>
                              <b>{c.name}, {c.date}: the app's entries</b>
                              {c.entries.map((e) => (
                                <label key={e.id} className='imppoprow'>
                                  <span>{KIND[e.kind]}{e.d !== c.date ? ' (next day)' : ''}</span>
                                  <input type='time' value={edit.vals[e.id] || ''} onChange={(ev) => setEdit({ ...edit, err: '', vals: { ...edit.vals, [e.id]: ev.target.value } })} />
                                </label>
                              ))}
                              <p className='muted' style={{ margin: '6px 0' }}>Excel says: {c.excel}</p>
                              {edit.err ? <p className='badline'>{edit.err}</p> : null}
                              <div className='imppopbtn'>
                                <button type='button' className='btn primary' disabled={saving} onClick={() => save(c)}>{saving ? 'Saving...' : 'Save'}</button>
                                <button type='button' className='btn' onClick={() => setEdit(null)}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {plan.unmatched.length ? (
            <div className='wide'>
              <h4 style={{ margin: '4px 0' }}>Names not matched (nothing is imported for them)</h4>
              <p className='muted'>{plan.unmatched.map((u) => u.name + ' (' + u.why + ')').join(' | ')}</p>
              <p className='muted'>Fix the spelling in the Excel file or on the Employees page, then read the file again.</p>
            </div>
          ) : null}

          {plan.problems.length ? (
            <details className='wide'>
              <summary>Rows skipped ({plan.problems.length})</summary>
              <ul className='muted'>{plan.problems.slice(0, 80).map((p, i) => <li key={i}>{p}</li>)}{plan.problems.length > 80 ? <li>...and {plan.problems.length - 80} more</li> : null}</ul>
            </details>
          ) : null}

          {nothing ? <p className='badline wide'>Nothing to import for these dates. Check the dates and that the sheet has times for them.</p> : null}
          {!nothing ? (
            <button className='btn primary' type='submit' disabled={open > 0}>
              {open > 0 ? 'Choose what to do for ' + open + ' more day' + (open > 1 ? 's' : '') : 'Import now'}
            </button>
          ) : null}
        </form>
      ) : null}
    </>
  );
}
