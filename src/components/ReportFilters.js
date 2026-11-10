'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import DeptPicker from '@/components/DeptPicker';

const addDays = (key, n) => {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthStart = (key) => key.slice(0, 8) + '01';
const lastMonth = (key) => {
  const d = new Date(monthStart(key) + 'T00:00:00Z');
  d.setUTCDate(0);
  const end = d.toISOString().slice(0, 10);
  return [monthStart(end), end];
};

// One compact filter bar for Reports and Analysis: quick period buttons, office, a searchable department list
// with removable tags, and custom dates when needed. Plain GET form, so every filter stays in the address.
export default function ReportFilters({
  today, lastDay, from: from0, to: to0, office: office0, canOffice, depts, selected, hidden = {}, resetHref, names = [], who: who0 = '',
  quick = ['7', '30', 'month', 'last'], children,
}) {
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(to0);
  const [office, setOffice] = useState(office0);
  const [sel, setSel] = useState(selected);
  const [custom, setCustom] = useState(false);
  const [who, setWho] = useState(who0);
  const form = useRef(null);

  const periods = useMemo(() => {
    const lm = lastMonth(today);
    return {
      day: ['Last work day', lastDay || today, lastDay || today],
      7: ['7 days', addDays(today, -6), today],
      30: ['30 days', addDays(today, -29), today],
      month: ['This month', monthStart(today), today],
      last: ['Last month', lm[0], lm[1]],
    };
  }, [today, lastDay]);
  const active = quick.find((k) => periods[k][1] === from && periods[k][2] === to) || '';
  const showDates = custom || !active;

  const submitSoon = () => setTimeout(() => form.current && form.current.requestSubmit(), 0);
  const pick = (k) => {
    setFrom(periods[k][1]);
    setTo(periods[k][2]);
    setCustom(false);
    submitSoon();
  };

  return (
    <form ref={form} method='get' className='card fbar'>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type='hidden' name={k} value={v} />)}
      <input type='hidden' name='from' value={from} />
      <input type='hidden' name='to' value={to} />
      {canOffice ? <input type='hidden' name='office' value={office} /> : null}

      <div className='fbar-row'>
        <div className='qseg' role='group' aria-label='Period'>
          {quick.map((k) => (
            <button type='button' key={k} className={active === k && !custom ? 'on' : ''} onClick={() => pick(k)}>{periods[k][0]}</button>
          ))}
          <button type='button' className={showDates ? 'on' : ''} onClick={() => setCustom(true)}>Custom</button>
        </div>

        {canOffice ? (
          <div className='qseg' role='group' aria-label='Office'>
            {[['', 'Both offices'], ['LHR', 'LHR'], ['ISB', 'ISB']].map(([v, l]) => (
              <button type='button' key={v || 'both'} className={office === v ? 'on' : ''} onClick={() => { setOffice(v); submitSoon(); }}>{l}</button>
            ))}
          </div>
        ) : null}

        <DeptPicker depts={depts} value={sel} onChange={setSel} autoSubmit tags={false} />

        <label className='fbar-field'>Employee
          <input
            name='who'
            type='search'
            value={who}
            list='fbar-names'
            placeholder='One employee (type a name)'
            autoComplete='off'
            onChange={(e) => {
              setWho(e.target.value);
              if (names.includes(e.target.value)) submitSoon();
            }}
          />
          <datalist id='fbar-names'>{names.map((n) => <option key={n} value={n} />)}</datalist>
        </label>

        {children}
        <button className='btn primary' type='submit'>Apply</button>
        <Link href={resetHref} className='btn ghost'>Reset</Link>
      </div>

      {showDates ? (
        <div className='fbar-dates'>
          <label>From<input type='date' value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type='date' value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      ) : null}

      {sel.length ? (
        <div className='dtags'>
          {sel.map((d) => (
            <span className='dtag' key={d}>
              {d}
              <button type='button' aria-label={'Remove ' + d} onClick={() => { setSel(sel.filter((x) => x !== d)); submitSoon(); }}>&times;</button>
            </span>
          ))}
        </div>
      ) : null}
    </form>
  );
}
