import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { editUser } from '@/lib/actions';
import { ROLE_LABEL } from '@/lib/fmt';
import Flash from '@/components/Flash';

export default async function EditUserPage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const id = Number(sp.id);
  const t = (await q(
    `SELECT u.id, u.name, u.email, u.role, o.code AS office FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.id = $1`,
    [Number.isInteger(id) ? id : 0]
  ))[0];
  if (!t) redirect('/team');

  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit {t.name}</h1>
          <p className='muted'>Changes are recorded in the Logs and the member is notified.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <form action={editUser} className='form'>
          <input type='hidden' name='id' value={t.id} />
          <label>Full name<input name='name' defaultValue={t.name} required /></label>
          <label>Email (login ID)<input name='email' type='email' defaultValue={t.email} required /></label>
          {t.role === 'om' ? (
            <label>Role<input value={ROLE_LABEL.om} disabled readOnly /></label>
          ) : (
            <label>Role
              <select name='role' defaultValue={t.role}>
                <option value='sso'>{ROLE_LABEL.sso}</option>
                <option value='so'>{ROLE_LABEL.so}</option>
              </select>
            </label>
          )}
          <label>Office
            <select name='office' defaultValue={t.office}><option>LHR</option><option>ISB</option></select>
          </label>
          <button className='btn primary' type='submit'>Save changes</button>
          <Link href='/team' className='btn ghost'>Cancel</Link>
        </form>
      </div>
    </>
  );
}
