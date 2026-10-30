import OfficeTag from '@/components/OfficeTag';
import { addPayee, editPayee, togglePayee } from '@/lib/payee-actions';
import ConfirmButton from '@/components/ConfirmButton';

// Sr. Ops Manager: people who are issued advances but never sign in to the app (a driver, a courier, a one-off
// helper). They show up as a recipient on the Advances page next to the real team members.
export default function Payees({ payees }) {
  const active = payees.filter((p) => p.active);
  const inactive = payees.filter((p) => !p.active);
  return (
    <details className='card'>
      <summary><b>Advance-only team members</b> <span className='muted'>({active.length}): people you issue advances to who never use the app</span></summary>
      {payees.length ? (
        <div className='tablewrap' style={{ marginTop: 10 }}>
          <table className='tx'>
            <thead><tr><th>Name</th><th>Office</th><th>Phone</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {[...active, ...inactive].map((p) => (
                <tr key={p.id}>
                  <td className='c-title'>
                    <form action={editPayee} className='inline'>
                      <input type='hidden' name='id' value={p.id} />
                      <input name='name' defaultValue={p.name} maxLength={80} aria-label={'Name of ' + p.name} disabled={!p.active} />
                      {!p.active ? <span className='muted'> (inactive)</span> : null}
                      <select name='office' defaultValue={p.office} disabled={!p.active}><option>LHR</option><option>ISB</option></select>
                      <input name='phone' defaultValue={p.phone} maxLength={30} placeholder='Phone (optional)' className='sm' disabled={!p.active} />
                      {p.active ? <button className='btn ghost' type='submit'>Save</button> : null}
                    </form>
                  </td>
                  <td className='c-meta'><OfficeTag o={p.office} /></td>
                  <td className='c-meta'>{p.phone || '-'}</td>
                  <td className='c-meta'>{p.note || '-'}</td>
                  <td className='act'>
                    <form action={togglePayee} className='inline'>
                      <input type='hidden' name='id' value={p.id} />
                      {p.active ? (
                        <ConfirmButton className='btn ghost' message={'Deactivate ' + p.name + '? Past advances stay exactly as they are; they just will not appear when issuing a new one.'}>Deactivate</ConfirmButton>
                      ) : (
                        <button className='btn ghost' type='submit'>Reactivate</button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className='muted' style={{ marginTop: 10 }}>None added yet.</p>}
      <form action={addPayee} className='form' style={{ marginTop: 10 }}>
        <label>Name<input name='name' maxLength={80} placeholder='For example: Asif (driver)' required autoComplete='off' /></label>
        <label>Office
          <select name='office' defaultValue='LHR'><option>LHR</option><option>ISB</option></select>
        </label>
        <label>Phone<input name='phone' maxLength={30} placeholder='Optional' autoComplete='off' /></label>
        <label className='wide'>Note<input name='note' maxLength={200} placeholder='Optional' autoComplete='off' /></label>
        <button className='btn primary' type='submit'>Add team member</button>
      </form>
    </details>
  );
}
