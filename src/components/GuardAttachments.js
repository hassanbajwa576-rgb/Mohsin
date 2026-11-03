'use client';
import { useRef, useState } from 'react';

// Shrinks a picture on the phone before it is sent: at most 800 pixels wide as a JPEG of roughly 100 KB or less.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('bad image'));
      i.src = url;
    });
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const scale = Math.min(1, 800 / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    for (let round = 0; round < 4; round++) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      for (const q of [0.7, 0.6, 0.5, 0.4]) {
        const out = c.toDataURL('image/jpeg', q);
        if (out.length <= 130000) return out;
      }
      w = Math.round(w * 0.8);
      h = Math.round(h * 0.8);
    }
    throw new Error('too big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const MAX = 10;

// One "Attach" button. It opens the phone's own chooser (camera, gallery or files); every picture picked is added to the list below,
// and the button can be used again to add more. Each picture gets a label (the next unused one is suggested) that can be changed.
export default function GuardAttachments({ kinds, saved = [] }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [gone, setGone] = useState([]);
  const input = useRef(null);
  const label = Object.fromEntries(kinds);
  const keep = saved.filter((s) => !gone.includes(s.id));

  const nextKind = (list) => {
    const used = new Set([...list.map((i) => i.kind), ...keep.map((s) => s.kind)]);
    const free = kinds.find(([k]) => k !== 'other' && !used.has(k));
    return free ? free[0] : 'other';
  };

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setErr('');
    let room = MAX - items.length - keep.length;
    for (const f of files) {
      if (room <= 0) {
        setErr('Up to ' + MAX + ' pictures can be attached.');
        break;
      }
      try {
        const data = await shrink(f);
        setItems((prev) => [...prev, { key: Math.random().toString(36).slice(2), kind: nextKind(prev), data }]);
        room -= 1;
      } catch {
        setErr('One of the pictures could not be used. Try another one.');
      }
    }
    setBusy(false);
  }

  return (
    <div className='gattach wide'>
      <b>Pictures <span className='muted'>(optional)</span></b>
      <small className='muted'>The guard's own picture, CNIC front and back, and the company guard card front and back. Tap the button to take a photo or choose from the gallery or files. You can add more one after another.</small>
      <div className='gbtns'>
        <button type='button' className='btn primary' onClick={() => input.current && input.current.click()} disabled={busy}>{busy ? 'Preparing...' : items.length + keep.length ? 'Attach more pictures' : 'Attach pictures'}</button>
      </div>
      <input ref={input} type='file' accept='image/*' multiple hidden onChange={onFiles} />
      {err ? <small className='badline'>{err}</small> : null}

      {keep.length || items.length ? (
        <ul className='glist'>
          {keep.map((s) => (
            <li key={'s' + s.id}>
              <a href={'/visitors/guards/photo?pid=' + s.id} target='_blank' rel='noreferrer' className='gname'>{label[s.kind] || 'Picture'} (saved)</a>
              <a href={'/visitors/guards/photo?pid=' + s.id} target='_blank' rel='noreferrer' className='btn'>View</a>
              <button type='button' className='btn ghost' onClick={() => setGone((g) => [...g, s.id])}>Remove</button>
            </li>
          ))}
          {items.map((i) => (
            <li key={i.key}>
              <img src={i.data} alt='' className='gthumb' />
              <select name='att_kind' value={i.kind} onChange={(e) => setItems((prev) => prev.map((x) => (x.key === i.key ? { ...x, kind: e.target.value } : x)))}>
                {kinds.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              <input type='hidden' name='att_data' value={i.data} />
              <button type='button' className='btn ghost' onClick={() => setItems((prev) => prev.filter((x) => x.key !== i.key))}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}
      {gone.map((id) => <input key={id} type='hidden' name='remove_att' value={id} />)}
    </div>
  );
}
