import { FUNDS } from '@/lib/fmt';
import { addFundType, renameFundType, removeFundType } from '@/lib/fund-actions';
import ConfirmButton from '@/components/ConfirmButton';

const KEEP = ['petty', 'brc', 'other'];

// Sr. Ops Manager: the list of advance types. Add one (for example BOLDBus) and it appears in every dropdown and report.
export default function FundTypes() {
  return (
    <details className='card'>
      <summary><b>Advance types</b> <span className='muted'>({Object.keys(FUNDS).length}): add or rename the types shown in every dropdown</span></summary>
      <div className='tablewrap' style={{ marginTop: 10 }}>
        <table className='tx'>
          <tbody>
            {Object.entries(FUNDS).map(([k, name]) => (
              <tr key={k}>
                <td>
                  <form action={renameFundType} className='inline'>
                    <input type='hidden' name='key' value={k} />
                    <input name='label' defaultValue={name} maxLength={30} aria-label={'Name of ' + name} />
                    <button className='btn ghost' type='submit'>Save name</button>
                  </form>
                </td>
                <td className='act'>
                  {KEEP.includes(k) ? <span className='muted'>original</span> : (
                    <form action={removeFundType} className='inline'>
                      <input type='hidden' name='key' value={k} />
                      <ConfirmButton className='btn ghost' message={'Remove the advance type ' + name + '? This only works if nothing was ever recorded against it.'}>Remove</ConfirmButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={addFundType} className='form' style={{ marginTop: 10 }}>
        <label className='wide'>New advance type<input name='label' maxLength={30} placeholder='For example: BOLDBus' required autoComplete='off' /></label>
        <button className='btn primary' type='submit'>Add advance type</button>
      </form>
    </details>
  );
}
