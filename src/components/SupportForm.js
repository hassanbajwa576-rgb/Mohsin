'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Pictures are shrunk on the phone or computer before they are sent, so a photo of a few MB becomes a few hundred KB.
async function shrink(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = no;
      i.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function SupportForm({ cats, prios, who, dueDays, allOffices, office, today }) {
  const router = useRouter();
  const form = useRef(null);
  const [files, setFiles] = useState([]);
  const [prio, setPrio] = useState('medium');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (e) => {
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    const next = [...files];
    for (const f of list) {
      if (next.length >= 4) break;
      next.push(await shrink(f));
    }
    setFiles(next);
  };

  const addDays = (n) => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const fd = new FormData(form.current);
      fd.delete('files');
      files.forEach((f) => fd.append('files', f));
      const r = await fetch('/api/support/new', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({ ok: false, error: 'Something went wrong. Please try again.' }));
      if (!j.ok) {
        setErr(j.error || 'Something went wrong. Please try again.');
        setBusy(false);
        return;
      }
      router.push('/support/view?id=' + j.id + '&ok=' + encodeURIComponent('Complaint recorded'));
    } catch {
      setErr('Could not send. Check the connection and try again.');
      setBusy(false);
    }
  };

  return (
    <form ref={form} onSubmit={send} className='form'>
      <label className='wide'>Title<input name='title' required minLength={3} maxLength={120} placeholder='For example: AC not working in the meeting room' autoComplete='off' /></label>
      <label>Category
        <select name='category' required defaultValue=''>
          <option value='' disabled>Choose</option>
          {cats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>Priority
        <select name='priority' value={prio} onChange={(e) => setPrio(e.target.value)}>
          {prios.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label>Due date
        <input type='date' name='due_on' key={prio} defaultValue={addDays(dueDays[prio])} min={today} />
      </label>
      {allOffices ? (
        <label>Office
          <select name='office' defaultValue={office}><option>LHR</option><option>ISB</option></select>
        </label>
      ) : null}
      <label>Location in the office<input name='location' maxLength={120} placeholder='For example: 2nd floor, meeting room' autoComplete='off' /></label>
      <label className='wide'>What happened<textarea name='description' required rows={4} maxLength={2000} placeholder='Describe the complaint so the person handling it understands.' /></label>
      <label>Complaint is from
        <select name='ctype' defaultValue='staff'>{who.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </label>
      <label>Their name<input name='cname' maxLength={80} placeholder='Optional' autoComplete='off' /></label>
      <label>Their phone<input name='cphone' type='tel' maxLength={30} placeholder='Optional' autoComplete='off' /></label>
      <div className='wide'>
        <span className='att-lbl'>Pictures or a PDF (up to 4)</span>
        <input type='file' accept='image/*,application/pdf' multiple onChange={pick} disabled={files.length >= 4} />
        {files.length ? (
          <div className='hostchips' style={{ marginTop: 6 }}>
            {files.map((f, i) => (
              <span key={f.name + i} className='hostchip'>{f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)
                <button type='button' aria-label={'Remove ' + f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))}>&times;</button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {err ? <p className='badline wide' style={{ margin: 0 }}>{err}</p> : null}
      <button className='btn primary' type='submit' disabled={busy}>{busy ? 'Sending...' : 'Record complaint'}</button>
    </form>
  );
}
