import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { q } from './db';

const COOKIE = 'pc_session';

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
}

export async function getUser() {
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
  const rows = await q(
    `SELECT u.id, u.name, u.email, u.role, u.office_id, o.code AS office_code FROM pc2_users u JOIN pc2_offices o ON o.id = u.office_id WHERE u.id = $1 AND u.active`,
    [uid]
  );
  return rows[0] || null;
}

export async function requireUser(roles) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (roles && !roles.includes(u.role)) redirect('/');
  return u;
}
