import 'server-only';
import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { q } from './db';
import { loadFunds } from './fund-types';
import { DEFAULT_ACTIONS } from './perms';

const COOKIE = 'pc_session';
const IMP = 'pc_imp';

function key() {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

export async function startSession(uid) {
  const token = await new SignJWT({ uid }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete(IMP);
}

// One user row with the role the Sr. Ops Manager created for them (if any): the role's permissions and pages are added to their own.
const USER_SQL = `SELECT u.id, u.name, u.email, u.role, u.perms, u.pages, u.totp_enabled, u.totp_required, u.office_id, o.code AS office_code, u.role_id, r.name AS role_name, r.sys_key AS role_sys, r.perms AS role_perms, r.pages AS role_pages FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id LEFT JOIN pc2_roles r ON r.id = u.role_id AND r.active WHERE u.id = $1 AND u.active`;
const csv = (v) => String(v || '').split(',').filter(Boolean);
function shape(row) {
  const own = csv(row.perms);
  const own_pages = csv(row.pages);
  // Someone not yet attached to a role gets what their built-in role always had.
  const fromRole = row.role_id ? csv(row.role_perms) : DEFAULT_ACTIONS[row.role] || [];
  return { ...row, perms: [...new Set([...own, ...fromRole])], pagesList: own_pages.length ? own_pages : csv(row.role_pages), roleName: row.role_name && !row.role_sys ? row.role_name : null };
}

// Memoised per request: the layout and the page share one database lookup.
export const getUser = cache(async function getUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  let uid;
  try {
    const { payload } = await jwtVerify(token, key());
    uid = payload.uid;
  } catch {
    return null;
  }
  const rows = await q(USER_SQL, [uid]);
  if (!rows[0]) return null;
  await loadFunds();
  const real = shape(rows[0]);
  // Sr. Ops Manager viewing as someone else (30 minutes): every page and action runs as that person.
  const imp = jar.get(IMP)?.value;
  if (imp && real.role === 'om') {
    try {
      const { payload } = await jwtVerify(imp, key());
      if (payload.k === 'imp' && Number(payload.by) === real.id) {
        const t = await q(USER_SQL, [payload.uid]);
        if (t[0] && t[0].role !== 'om') {
          return { ...shape(t[0]), totp_required: false, impersonatedBy: { id: real.id, name: real.name } };
        }
      }
    } catch {
      // an expired or invalid marker simply means no view-as
    }
  }
  return real;
});

export async function requireUser(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  // Someone the Sr. Ops Manager asked to use the authenticator must set it up first.
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  // Guards only ever see the attendance module: every other page sends them there.
  if (u.role === 'guard' && !(roles && roles.includes('guard'))) redirect('/attendance');
  if (roles && !roles.includes(u.role)) redirect('/');
  return u;
}

// ---- authenticator app: step between password and session, and trusted devices
const PENDING = 'pc_mfa';
const DEVICE = 'pc_dev';

export async function startPending(uid) {
  const token = await new SignJWT({ uid, k: 'mfa' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('10m').sign(key());
  const jar = await cookies();
  jar.set(PENDING, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
}

export async function getPending() {
  const jar = await cookies();
  const t = jar.get(PENDING)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.k === 'mfa' ? Number(payload.uid) : null;
  } catch {
    return null;
  }
}

export async function clearPending() {
  const jar = await cookies();
  jar.delete(PENDING);
}

// A device that passed the check once is trusted for 30 days (until the epoch changes on a reset).
export async function trustDevice(uid, epoch) {
  const token = await new SignJWT({ uid, e: epoch, k: 'dev' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30d').sign(key());
  const jar = await cookies();
  jar.set(DEVICE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}

export async function isTrusted(uid, epoch) {
  const jar = await cookies();
  const t = jar.get(DEVICE)?.value;
  if (!t) return false;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.k === 'dev' && Number(payload.uid) === Number(uid) && Number(payload.e) === Number(epoch);
  } catch {
    return false;
  }
}

export async function startImpersonation(by, uid) {
  const token = await new SignJWT({ by, uid, k: 'imp' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30m').sign(key());
  const jar = await cookies();
  jar.set(IMP, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 1800 });
}

export async function stopImpersonation() {
  const jar = await cookies();
  jar.delete(IMP);
}
