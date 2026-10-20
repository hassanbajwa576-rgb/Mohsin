'use client';

import { useActionState, useState } from 'react';
import { previewImport, confirmImport } from '@/lib/att-actions';

const CHOICES = [
  ['keep', 'Keep what is in the app'],
  ['add', 'Add the Excel entries as well'],
  ['replace', 'Replace the app entries with Excel'],
];

// Step 1: choose the file(s) and dates. Step 2: review what will happen, decide every conflict, then import.
export default function ImportExcel({ from, to }) {
  const [state, run, busy] = useActionState(previewImport, null);
  const plan = state && state.plan;
  const [choice, setChoice] = useState({});
  const [seen, setSeen] = useState(null);
  if (plan && seen !== plan) {
    setSeen(plan);
    setChoice({});
  }
  const open = plan ? plan.conflicts.filter((c) => !choice[c.key]).length : 0;
  const nothing = plan && !plan.fresh && !plan.conflicts.length;

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
          <input type='hidden' name='from' value={plan.from} />
          <input type='hidden' name='to' value={plan.to} />
          {plan.conflicts.map((c) => (
            <input key={c.key} type='hidden' name={'c:' + c.key} value={choice[c.key] || ''} />
          ))}

          <h3 className='wide' style={{ margin: 0 }}>Preview: {plan.from} to {plan.to}</h3>
          <div className='wide impsum'>
            <div><b>{plan.fresh}</b><span>employee-days will be added ({plan.freshEntries} entries)</span></div>
            <div><b>{plan.conflicts.length}</b><span>already have entries in the app: your review needed</span></div>
            <div><b>{plan.unmatched.length}</b><span>names not matched</span></div>
            <div><b>{plan.problems.length}</b><span>rows skipped</span></div>
          </div>
          {plan.days.length ? <p className='muted wide'>New days: {plan.days.map(([d, n]) => d.slice(5) + ' (' + n + ')').join(' | ')}</p> : null}

          {plan.conflicts.length ? (
            <div className='wide'>
              <h4 style={{ margin: '4px 0' }}>Days that already have entries: choose for each</h4>
              <p className='muted'>Nothing is changed on these days until you choose.
                {' '}
                <button type='button' className='linkbtn' onClick={() => setChoice(Object.fromEntries(plan.conflicts.map((c) => [c.key, 'keep'])))}>Keep the app entries for all</button>
              </p>
              <div className='tablewrap'>
                <table className='tx tiles'>
                  <thead><tr><th>Employee</th><th>Date</th><th>In the app</th><th>In the Excel file</th><th>What to do</th></tr></thead>
                  <tbody>
                    {plan.conflicts.map((c) => (
                      <tr key={c.key} className={choice[c.key] ? '' : 'impwait'}>
                        <td className='c-title'><b>{c.name}</b></td>
                        <td className='nw c-meta'>{c.date}</td>
                        <td className='c-meta'>{c.app}</td>
                        <td className='c-meta'><span className='xl'>{c.excel}</span></td>
                        <td>
                          {CHOICES.filter(([v]) => !(c.breaksOnly && v === 'replace')).map(([v, label]) => (
                            <label key={v} className='checkrow'>
                              <input type='radio' name={'pick-' + c.key} checked={choice[c.key] === v} onChange={() => setChoice({ ...choice, [c.key]: v })} /> {c.breaksOnly && v === 'add' ? 'Add the breaks from Excel' : label}
                            </label>
                          ))}
                        </td>
                      </tr>
                    ))}
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
