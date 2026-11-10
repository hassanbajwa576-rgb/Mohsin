// Why an employee is being deactivated: a reason from the list plus an optional note ("Other" needs the note).
export const REASONS = ['Resigned', 'Terminated', 'Contract ended', 'Transferred', 'Long leave', 'Other'];

export default function ReasonFields({ reason = '', required = true }) {
  return (
    <>
      <label>Reason
        <select name='reason' defaultValue={REASONS.includes(reason) ? reason : ''} required={required}>
          <option value=''>Choose a reason</option>
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label>Note (needed for Other)<input name='reason_note' maxLength={120} placeholder='Optional' autoComplete='off' /></label>
    </>
  );
}
