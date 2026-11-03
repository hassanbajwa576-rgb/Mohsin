import Link from 'next/link';
import GuardAttachments from '@/components/GuardAttachments';
import { SHIFTS, PHOTO_KINDS } from '@/lib/guards';

// Add or correct a temporary guard's duty: who he is, who he is replacing and until when. The same form is used for both.
export default function GuardDutyForm({ action, duty, names, today, label = 'Save duty' }) {
  const d = duty || {};
  const have = d.photos || [];
  return (
    <form action={action} className='form'>
      {duty ? <input type='hidden' name='id' value={duty.id} /> : null}
      <label>Guard's full name<input name='name' defaultValue={d.name || ''} maxLength={80} required autoComplete='off' /></label>
      <label>Mobile number<input name='mobile' type='tel' defaultValue={d.mobile || ''} placeholder='03xx-xxxxxxx' required autoComplete='off' /></label>
      <label>CNIC number<input name='cnic' defaultValue={d.cnic || ''} inputMode='numeric' placeholder='35202-1234567-1' maxLength={15} required autoComplete='off' /></label>
      <label>Company guard card number<input name='card_no' defaultValue={d.card_no || ''} maxLength={30} placeholder='Optional' autoComplete='off' /></label>
      <label className='wide'>In place of (the regular guard he is replacing)
        <input name='in_place_of' list='guard-names' defaultValue={d.taken_over_from || ''} maxLength={80} placeholder='Pick or type a name' required autoComplete='off' />
      </label>
      <datalist id='guard-names'>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <label>Guard duty from<input type='date' name='duty_from' defaultValue={d.duty_from || today} required /></label>
      <label>Guard duty to<input type='date' name='duty_to' defaultValue={d.duty_to || today} required /></label>
      <label>Shift
        <select name='shift' defaultValue={d.shift || 'morning'}>{Object.entries(SHIFTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className='wide'>Note<input name='note' defaultValue={d.note || ''} maxLength={200} placeholder='Optional' autoComplete='off' /></label>
      <GuardAttachments kinds={PHOTO_KINDS} saved={have} />
      <p className='muted wide'>Pictures are deleted 90 days after the guard's last duty.</p>
      <button className='btn primary' type='submit'>{label}</button>
      {duty ? <Link href='/visitors/guards' className='btn ghost'>Cancel</Link> : null}
    </form>
  );
}
