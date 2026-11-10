'use client';

import { useEffect, useRef, useState } from 'react';

// The one department picker used everywhere: a button that opens a searchable two-column checklist
// (Select all / Clear / Done), with removable tags below. It writes hidden inputs, so it works inside any plain form.
// autoSubmit: reload the page (submit the surrounding form) when Done is pressed or a tag is removed.
// Pass value + onChange to control it from the parent (so the parent can show the tags elsewhere, tags={false}).
export default function DeptPicker({ depts, selected = [], value = null, name = 'dept', autoSubmit = false, tags = true, onChange = null, allLabel = 'All departments' }) {
  const [inner, setSel] = useState(selected);
  const sel = value || inner;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [flip, setFlip] = useState(false);
  const wrap = useRef(null);
  const popRef = useRef(null);

  const change = (next) => {
    setSel(next);
    if (onChange) onChange(next);
  };
  const submitSoon = () => {
    if (!autoSubmit) return;
    setTimeout(() => {
      const f = wrap.current && wrap.current.closest('form');
      if (f) f.requestSubmit();
    }, 0);
  };

  // Open towards the left when the list would run off the right edge of the screen.
  useEffect(() => {
    if (!open) {
      setFlip(false);
      return;
    }
    const el = popRef.current;
    if (el) setFlip(el.getBoundingClientRect().right > window.innerWidth - 8);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const shown = depts.filter((d) => d.toLowerCase().includes(text.trim().toLowerCase()));
  const toggle = (d) => change(sel.includes(d) ? sel.filter((x) => x !== d) : [...sel, d]);

  return (
    <>
      {sel.map((d) => <input key={d} type='hidden' name={name} value={d} />)}
      <div className='dwrap' ref={wrap}>
        <button type='button' className='dbtn' onClick={() => setOpen(!open)} aria-expanded={open}>
          {sel.length ? 'Departments (' + sel.length + ')' : allLabel} <span aria-hidden='true'>&#9662;</span>
        </button>
        {open ? (
          <div className={'dpop' + (flip ? ' flip' : '')} ref={popRef}>
            <input className='dsearch' type='search' placeholder='Search departments' value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <div className='dcols'>
              {shown.map((d) => (
                <label key={d}><input type='checkbox' checked={sel.includes(d)} onChange={() => toggle(d)} /> <span>{d}</span></label>
              ))}
              {!shown.length ? <p className='muted'>No department matches.</p> : null}
            </div>
            <div className='dfoot'>
              <span>
                <button type='button' className='linkbtn' onClick={() => change([...new Set([...sel, ...shown])])}>Select all</button>
                {' · '}
                <button type='button' className='linkbtn' onClick={() => change([])}>Clear</button>
              </span>
              <button type='button' className='btn primary' onClick={() => { setOpen(false); submitSoon(); }}>Done</button>
            </div>
          </div>
        ) : null}
      </div>
      {tags && sel.length ? (
        <div className='dtags'>
          {sel.map((d) => (
            <span className='dtag' key={d}>
              {d}
              <button type='button' aria-label={'Remove ' + d} onClick={() => { change(sel.filter((x) => x !== d)); submitSoon(); }}>&times;</button>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
