'use client';
import { useState } from 'react';

// Shrinks a photo on the phone before it is sent: at most 800 pixels wide as a JPEG of roughly 100 KB or less.
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
        if (out.length <= 190000) return out;
      }
      w = Math.round(w * 0.8);
      h = Math.round(h * 0.8);
    }
    throw new Error('too big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// One optional photo: pick or take it, see a preview, and (when one is already saved) tick to remove it.
export default function GuardPhoto({ name, label, saved, hint }) {
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function pick(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      setVal(await shrink(f));
    } catch {
      setVal('');
      setErr('That photo could not be used. Try another one.');
    }
    setBusy(false);
  }

  return (
    <div className='gphoto'>
      <b>{label} <span className='muted'>(optional)</span></b>
      {hint ? <small className='muted'>{hint}</small> : null}
      <input type='file' accept='image/*' onChange={pick} />
      <input type='hidden' name={name} value={val} />
      {busy ? <small className='muted'>Preparing the photo...</small> : null}
      {err ? <small className='badline'>{err}</small> : null}
      {val ? <img src={val} alt='' className='gpreview' /> : null}
      {saved && !val ? (
        <label className='perm'>
          <input type='checkbox' name={'remove_' + (name === 'photo_cnic' ? 'cnic' : 'guard')} />
          <span>A photo is saved. Tick to remove it, or choose a new one to replace it.</span>
        </label>
      ) : null}
    </div>
  );
}
