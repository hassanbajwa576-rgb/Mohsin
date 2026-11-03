import Link from 'next/link';
import GuardPhoto from '@/components/GuardPhoto';
import { SHIFTS } from '@/lib/guards';

// Add or correct a relief guard's duty. The same form is used for both.
export default function GuardDutyForm({ action, duty, names, today, label = 'Save duty' }) {
  const d = duty || {};
  return (
    <form action={action} className='form'>
      {duty ? <input type='hidden' name='id' value={duty.id} /> : null}
      <label>Full name<input name='name' defaultValue={d.name || ''} maxLength={80} required autoComplete='off' /></label>
      <label>Mobile number<input name='mobile' type='tel' defaultValue={d.mobile || ''} placeholder='03xx-xxxxxxx' required autoComplete='off' /></label>
      <label>CNIC number<input name='cnic' defaultValue={d.cnic || ''} inputMode='numeric' placeholder='35202-1234567-1' maxLength={15} required autoComplete='off' /></label>
      <label>Employee card number<input name='card_no' defaultValue={d.card_no || ''} maxLength={30} placeholder='Optional' autoComplete='off' /></label>
      <label>Duty from<input type='date' name='duty_from' defaultValue={d.duty_from || today} required /></label>
      <label>Duty to<input type='date' name='duty_to' defaultValue={d.duty_to || today} required /></label>
      <label>Shift
        <select name='shift' defaultValue={d.shift || 'morning'}>{Object.entries(SHIFTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label>Duty handed over to
        <input name='handed_over_to' list='guard-names' defaultValue={d.handed_over_to || ''} maxLength={80} placeholder='Pick or type a name' autoComplete='off' />
      </label>
      <label>Duty taken over from
        <input name='taken_over_from' list='guard-names' defaultValue={d.taken_over_from || ''} maxLength={80} placeholder='Pick or type a name' autoComplete='off' />
      </label>
      <datalist id='guard-names'>{names.map((n) => <option key={n} value={n} />)}</datalist>
      <label className='wide'>Note<input name='note' defaultValue={d.note || ''} maxLength={200} placeholder='Optional' autoComplete='off' /></label>
      <div className='wide gphotos'>
        <GuardPhoto name='photo_cnic' label='CNIC photo' saved={!!d.has_cnic} hint='Front of the card. Kept for 90 days after the last duty.' />
        <GuardPhoto name='photo_guard' label='Guard photo' saved={!!d.has_guard} hint='A clear photo of the guard. Kept for 90 days after the last duty.' />
      </div>
      <button className='btn primary' type='submit'>{label}</button>
      {duty ? <Link href='/visitors/guards' className='btn ghost'>Cancel</Link> : null}
    </form>
  );
}
