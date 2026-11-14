'use client';

import { useMemo, useState } from 'react';
import { parseFigures, matchPerson, MON_LABEL } from '@/lib/dk-paste';

// Paste monthly figures (PTO given, or leave taken) for any months of a year, check the preview, then import.
export default function LeaveImport({ people, year, action }) {
  const [kind, setKind] = useState('given');
  const [from, setFrom] = useState(1);
  const [overwrite, setOverwrite] = useState(false);
  const [text, setText] = useState('');
  const view = useMemo(() => {
    const { rows, warnings } = parseFigures(text, from);
    const items = rows.map((r) => {
      const m = matchPerson(r.name, people);
      return { ...r, person: m.person || null, error: m.error || '' };
    });
    return { items, warnings, count: items.filter((i) => i.person).reduce((a, i) => a + i.cells.length, 0) };
  }, [text, from, people]);

  return (
    <form action={action}>
      <input type='hidden' name='year' value={year} />
      <div className='filters' style={{ marginBottom: 10 }}>
        <label>These figures are
          <select name='kind' value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value='given'>PTO given (allocation)</option>
            <option value='taken'>Leave taken</option>
          </select>
        </label>
        <label>First number is for
          <select name='from' value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {MON_LABEL.map((m, i) => <option key={m} value={i + 1}>{m} {year}</option>)}
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type='checkbox' name='overwrite' value='1' checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} style={{ width: 'auto' }} />
          Replace months that already have a number
        </label>
      </div>
      <label style={{ display: 'block' }}>Figures (one person per line)
        <textarea
          name='text'
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Faizan Ali 4 4 4 4\nM. Shahbaz 4 4 3 -\n\nOptional first line to choose the months:\nNov Dec\nFaizan Ali 4 4'}
          style={{ fontFamily: 'monospace' }}
        />
      </label>
      <p className='muted' style={{ margin: '6px 0' }}>Copy rows straight from a spreadsheet, or type them. Names can be short ("M. Shahbaz"); a dash means nothing for that month. Without a month line, the first number goes to the month chosen above and the rest follow.</p>

      {view.items.length ? (
        <div className='tablewrap'>
          <table className='tx'>
            <thead><tr><th>Typed name</th><th>Matched to</th><th>Months</th></tr></thead>
            <tbody>
              {view.items.map((it, i) => (
                <tr key={i}>
                  <td className='c-title'>{it.name}</td>
                  <td className='c-meta'>{it.person ? <b>{it.person.name}</b> : <span style={{ color: '#b3261e', fontWeight: 600 }}>{it.error === 'more than one' ? 'more than one person matches' : 'not found in the team'}</span>}</td>
                  <td className='c-meta'>{it.cells.length ? it.cells.map((c) => MON_LABEL[c.month - 1] + ' ' + c.days).join(' · ') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {view.warnings.length ? <p className='muted' style={{ color: '#8a5a00' }}>{view.warnings.join('. ')}.</p> : null}
      <button className='btn primary' type='submit' disabled={!view.count} style={{ marginTop: 10 }}>{view.count ? 'Import ' + view.count + ' month entries' : 'Import'}</button>
    </form>
  );
}
