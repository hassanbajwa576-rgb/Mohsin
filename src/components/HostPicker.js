'use client';

import { useState } from 'react';

// "Meeting with" for one or more people. Pick or type a name and press Enter, comma or Add; each name becomes a chip.
// The names travel as one text value, separated by commas, so older records with a single name still work.
export default function HostPicker({ name = 'host', names = [], defaultValue = '', listId = 'vis-hosts-pick' }) {
  const [list, setList] = useState(() => String(defaultValue || '').split(',').map((x) => x.trim()).filter(Boolean));
  const [text, setText] = useState('');

  const add = (raw) => {
    const v = String(raw).replace(/,/g, ' ').trim().slice(0, 60);
    if (!v) return;
    setList((l) => (l.some((x) => x.toLowerCase() === v.toLowerCase()) || l.length >= 8 ? l : [...l, v]));
    setText('');
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && list.length) {
      setList((l) => l.slice(0, -1));
    }
  };
  // A name picked from the suggestions arrives as a whole word: add it straight away.
  const onChange = (e) => {
    const v = e.target.value;
    const hit = e.nativeEvent && e.nativeEvent.inputType === 'insertReplacementText';
    if (hit || (names.includes(v) && !e.nativeEvent.inputType)) add(v);
    else setText(v);
  };

  return (
    <div className='hostpick'>
      <input type='hidden' name={name} value={list.concat(text.trim() ? [text.trim()] : []).join(', ')} />
      {list.length ? (
        <span className='hostchips'>
          {list.map((h) => (
            <span key={h} className='hostchip'>{h}<button type='button' aria-label={'Remove ' + h} onClick={() => setList((l) => l.filter((x) => x !== h))}>&times;</button></span>
          ))}
        </span>
      ) : null}
      <span className='hostrow'>
        <input value={text} onChange={onChange} onKeyDown={onKey} onBlur={() => add(text)} list={listId} placeholder={list.length ? 'Add another person' : 'Type a name'} autoComplete='off' maxLength={60} data-nofix='1' />
        <button type='button' className='btn' onClick={() => add(text)}>Add</button>
      </span>
      <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
    </div>
  );
}
