'use client';

import { useEffect, useRef, useState } from 'react';

const KEY = 'ot-opsbot';
const hhmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const CHIPS = (om) => (om ? ['How much did we spend this year?', 'ISB spend by month', 'Top heads this year', 'Compare with last year', 'Budget vs actual year to date', 'Who holds the cash?'] : ['What is my cash in hand?', 'How many expenses are waiting?', 'Visitors today', 'Advances outstanding']);
const FIRST = (om) => ({
  from: 'bot',
  t: hhmm(),
  text: om
    ? 'Hi, I am OpsBot. Ask me about spending by office, head or month, the budget, year against year, cash in hand, or visitors.'
    : 'Hi, I am OpsBot. Ask me about your cash in hand, advances, expenses or visitors.',
});

// Floating chat, like BOLDBot on the AlphaBOLD website. It answers from the data in the app, for the access this person has.
export default function OpsBot({ role }) {
  const om = role === 'om';
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([FIRST(om)]);
  const [chips, setChips] = useState(om ? ['How much did we spend this year?', 'ISB spend by month', 'Top heads this year', 'Compare with last year', 'Budget vs actual year to date', 'Who holds the cash?'] : ['What is my cash in hand?', 'How many expenses are waiting?', 'Visitors today', 'Advances outstanding']);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (s && Array.isArray(s) && s.length) setMsgs(s);
    } catch {
      // chat history is only a convenience
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      // ignore
    }
    if (end.current) end.current.scrollIntoView({ block: 'end' });
  }, [msgs, open, busy]);

  // Erase the chat: back to the welcome message and the suggestions.
  function clear() {
    setMsgs([FIRST(om)]);
    setChips(CHIPS(om));
    setText('');
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // nothing stored
    }
  }

  async function send(q) {
    const v = String(q ?? text).trim();
    if (!v || busy) return;
    setText('');
    setChips([]);
    setMsgs((m) => [...m, { from: 'me', t: hhmm(), text: v }]);
    setBusy(true);
    try {
      const r = await fetch('/api/opsbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: v }) });
      const j = await r.json();
      setMsgs((m) => [...m, { from: 'bot', t: hhmm(), text: j.reply || 'I could not find an answer.' }]);
      setChips(j.suggestions || []);
    } catch {
      setMsgs((m) => [...m, { from: 'bot', t: hhmm(), text: 'I could not reach the app. Please try again.' }]);
    }
    setBusy(false);
  }

  return (
    <>
      {open ? (
        <div className='ob-panel' role='dialog' aria-label='OpsBot'>
          <div className='ob-head'>
            <span className='ob-av'><span className='ob-dot' /></span>
            <b>OpsBot</b>
            <button type='button' className='ob-clear' onClick={clear} title='Erase this chat'>Clear chat</button>
            <button type='button' className='ob-x' aria-label='Close chat' onClick={() => setOpen(false)}>×</button>
          </div>
          <div className='ob-body'>
            {msgs.map((m, i) => (
              <div key={i} className={'ob-row ' + m.from}>
                {m.from === 'bot' ? <small className='ob-who'>OpsBot</small> : null}
                <div className='ob-bub'>{m.text}<small>{m.t}</small></div>
              </div>
            ))}
            {busy ? <div className='ob-row bot'><div className='ob-bub ob-typing'>...</div></div> : null}
            {chips.length ? <div className='ob-chips'>{chips.map((c) => <button key={c} type='button' onClick={() => send(c)}>{c}</button>)}</div> : null}
            <div ref={end} />
          </div>
          <form className='ob-in' onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Write a message...' maxLength={300} aria-label='Message' autoComplete='off' />
            <button type='submit' aria-label='Send' disabled={busy}>Send</button>
          </form>
        </div>
      ) : null}
      <button type='button' className='ob-fab' aria-label={open ? 'Close OpsBot' : 'Chat with OpsBot'} onClick={() => setOpen((v) => !v)}>
        <svg viewBox='0 0 24 24' width='28' height='28' fill='none' stroke='#fff' strokeWidth='1.8' strokeLinejoin='round' aria-hidden='true'>
          <path d='M4 6h12v8H9l-3 3v-3H4z' />
          <path d='M8 18h8l3 3v-3h1V9' strokeLinecap='round' />
        </svg>
      </button>
    </>
  );
}
