import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { editRole } from '@/lib/role-actions';
import RoleForm from '@/components/RoleForm';
import Flash from '@/components/Flash';

export default async function EditRolePage({ searchParams }) {
  await requireUser(['om']);
  const sp = await searchParams;
  const id = Number(sp.id);
  const role = (await q('SELECT id, name, base, perms, pages, sys_key FROM pc2_roles WHERE id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!role) redirect('/roles');
  return (
    <>
      <div className='head'>
        <div>
          <h1>Edit role {role.name}</h1>
          <p className='muted'>Changes apply to everyone on this role straight away. They are recorded in the Logs.</p>
        </div>
      </div>
      <Flash sp={sp} />
      <div className='card'>
        <RoleForm action={editRole} role={role} label='Save changes' />
      </div>
    </>
  );
}
