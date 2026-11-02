'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { notifyUser } from './notify';
import { ALL_PERMS, ACTION_PERMS, ROLE_PERMS, BASES } from './perms';
import { ALL_PAGES, PAGE_NEEDS, defaultPages } from './pages';

const s = (fd, k) => String(fd.get(k) ?? '').trim();

async function needOm() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.role !== 'om' || u.impersonatedBy) redirect('/');
  return u;
}

function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

// Read the form: name, what the role works like, the permissions and the pages that were ticked.
function readRole(fd, here, fixed) {
  const name = fixed ? fixed.name : s(fd, 'name').slice(0, 40);
  const base = fixed ? fixed.base : s(fd, 'base');
  if (!name) back(here, 'Give the role a name');
  if (!BASES.some(([k]) => k === base)) back(here, 'Pick what the role works like');
  const permList = ALL_PERMS.map(([k]) => k).filter((k) => fd.get('perm_' + k) === 'on' && !(ROLE_PERMS[base] || []).includes(k) || (ACTION_PERMS.some(([a]) => a === k) && fd.get('perm_' + k) === 'on'));
  const ticked = fd.getAll('pg').map(String).filter((h) => ALL_PAGES.includes(h));
  for (const h of ticked) {
    const need = PAGE_NEEDS[h];
    if (need && !(ROLE_PERMS[base] || []).includes(need) && !permList.includes(need)) permList.push(need);
  }
  const dflt = defaultPages(base, permList, ROLE_PERMS);
  const same = ticked.length === 0 || (ticked.length === dflt.length && dflt.every((h) => ticked.includes(h)));
  return { name, base, perms: permList.join(','), pages: fd.get('pages_form') === '1' && !same ? ticked.join(',') : '' };
}

export async function createRole(fd) {
  const u = await needOm();
  const r = readRole(fd, '/roles');
  let id = null;
  try {
    id = (await q('INSERT INTO pc2_roles (name, base, perms, pages, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [r.name, r.base, r.perms, r.pages, u.id]))[0].id;
  } catch {
    back('/roles', 'A role with that name already exists');
  }
  await logEvent(u, 'create', 'role', id, 'Created role ' + r.name + ' (works like ' + r.base.toUpperCase() + ')', null, r);
  back('/roles', 'Role ' + r.name + ' created. Assign it to people from the Team page.', true);
}

export async function editRole(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const here = '/roles/edit?id=' + id;
  const before = (await q('SELECT id, name, base, perms, pages, sys_key FROM pc2_roles WHERE id = $1', [id]))[0];
  if (!before) back('/roles', 'Role not found');
  if (before.sys_key === 'om') back('/roles', 'The Sr. Ops Manager role is fixed and always has full access');
  const r = readRole(fd, here, before.sys_key ? { name: before.name, base: before.base } : null);
  try {
    await q('UPDATE pc2_roles SET name = $1, base = $2, perms = $3, pages = $4 WHERE id = $5', [r.name, r.base, r.perms, r.pages, id]);
    // People on this role follow its base role.
    await q('UPDATE pc2_users SET role = $1 WHERE role_id = $2 AND role <> $3', [r.base, id, 'om']);
  } catch {
    back(here, 'A role with that name already exists');
  }
  await logEvent(u, 'edit', 'role', id, 'Edited role ' + r.name, { name: before.name, base: before.base, perms: before.perms, pages: before.pages }, r);
  for (const m of await q('SELECT id FROM pc2_users WHERE role_id = $1 AND active', [id])) {
    if (m.id !== u.id) await notifyUser(m.id, u.name + ' updated your role ' + r.name + ': your access may have changed', '/profile');
  }
  back('/roles', 'Role ' + r.name + ' updated', true);
}

export async function toggleRole(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const r = (await q('UPDATE pc2_roles SET active = NOT active WHERE id = $1 AND sys_key IS NULL RETURNING name, active', [id]))[0];
  if (r) await logEvent(u, 'update', 'role', id, (r.active ? 'Reactivated role ' : 'Deactivated role ') + r.name);
  back('/roles', r ? 'Role ' + (r.active ? 'reactivated' : 'deactivated') : 'Built-in roles cannot be deactivated', !!r);
}
