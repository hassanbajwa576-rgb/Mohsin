'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { can } from './perms';
import { logEvent } from './audit';
import { notifyRoles } from './notify';
import { SHIFTS } from './guards';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const badDate = (d) => d.length !== 10 || Number.isNaN(Date.parse(d));
const PAGE = '/visitors/guards';

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, 'guard_duty')) redirect('/');
  return u;
}

function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}

// A photo arrives already shrunk to a small JPEG by the phone; anything else is ignored.
const JPEG = 'data:image/jpeg;base64,';
function photoOf(fd, key) {
  const v = String(fd.get(key) ?? '');
  return v.startsWith(JPEG) && v.length <= 260000 ? v.slice(JPEG.length) : '';
}

async function savePhoto(guardId, kind, b64, uid) {
  await q(
    `INSERT INTO pc2_guard_photos (guard_id, kind, mime, data, created_by) VALUES ($1,$2,'image/jpeg',$3,$4) ON CONFLICT (guard_id, kind) DO UPDATE SET mime = 'image/jpeg', data = EXCLUDED.data, created_by = EXCLUDED.created_by, created_at = now()`,
    [guardId, kind, b64, uid]
  );
}

function read(fd, here) {
  const name = s(fd, 'name').slice(0, 80);
  const mobile = s(fd, 'mobile').slice(0, 20);
  const digits = s(fd, 'cnic').replace(/\D/g, '');
  const card = s(fd, 'card_no').slice(0, 30);
  const from = s(fd, 'duty_from');
  const to = s(fd, 'duty_to');
  const shift = s(fd, 'shift');
  if (!name) back(here, 'Enter the guard\'s full name');
  if (mobile.replace(/\D/g, '').length < 10) back(here, 'Enter a valid mobile number');
  if (digits.length !== 13) back(here, 'The CNIC must have 13 digits');
  if (badDate(from) || badDate(to)) back(here, 'Pick the duty dates');
  if (to < from) back(here, 'Duty to cannot be before duty from');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 30) back(here, 'A single entry can cover up to 31 days');
  if (!SHIFTS[shift]) back(here, 'Pick the shift');
  return {
    name, mobile, card, from, to, shift,
    cnic: digits.slice(0, 5) + '-' + digits.slice(5, 12) + '-' + digits.slice(12),
    hand: s(fd, 'handed_over_to').slice(0, 80),
    take: s(fd, 'taken_over_from').slice(0, 80),
    note: s(fd, 'note').slice(0, 200),
  };
}

// Add a duty (a new relief guard, or another stretch for one already on file) or correct an existing one.
export async function saveGuardDuty(fd) {
  const u = await need();
  let id = Number(s(fd, 'id')) || 0;
  const here = id ? PAGE + '/edit?id=' + id : PAGE;
  const r = read(fd, here);
  let guardId;
  if (id) {
    const cur = (await q('SELECT id, guard_id FROM pc2_guard_duty WHERE id = $1', [id]))[0];
    if (!cur) back(PAGE, 'Entry not found');
    guardId = cur.guard_id;
    try {
      await q('UPDATE pc2_relief_guards SET name = $1, mobile = $2, cnic = $3, card_no = $4 WHERE id = $5', [r.name, r.mobile, r.cnic, r.card, guardId]);
    } catch {
      back(here, 'That CNIC belongs to another relief guard');
    }
    await q('UPDATE pc2_guard_duty SET duty_from = $1, duty_to = $2, shift = $3, handed_over_to = $4, taken_over_from = $5, note = $6, updated_by = $7 WHERE id = $8', [r.from, r.to, r.shift, r.hand, r.take, r.note, u.id, id]);
  } else {
    guardId = (await q(
      `INSERT INTO pc2_relief_guards (name, mobile, cnic, card_no, created_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cnic) DO UPDATE SET name = EXCLUDED.name, mobile = EXCLUDED.mobile, card_no = EXCLUDED.card_no RETURNING id`,
      [r.name, r.mobile, r.cnic, r.card, u.id]
    ))[0].id;
    id = (await q('INSERT INTO pc2_guard_duty (guard_id, duty_from, duty_to, shift, handed_over_to, taken_over_from, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [guardId, r.from, r.to, r.shift, r.hand, r.take, r.note, u.id]))[0].id;
  }
  for (const [kind, key] of [['cnic', 'photo_cnic'], ['guard', 'photo_guard']]) {
    const b64 = photoOf(fd, key);
    if (b64) await savePhoto(guardId, kind, b64, u.id);
    else if (s(fd, 'remove_' + kind) === 'on') await q('DELETE FROM pc2_guard_photos WHERE guard_id = $1 AND kind = $2', [guardId, kind]);
  }
  const what = r.name + ' - ' + (r.from === r.to ? r.from : r.from + ' to ' + r.to) + ', ' + SHIFTS[r.shift].toLowerCase();
  await logEvent(u, s(fd, 'id') ? 'edit' : 'create', 'guard_duty', id, (s(fd, 'id') ? 'Edited' : 'Added') + ' relief guard duty: ' + what);
  if (u.role !== 'om') await notifyRoles(['om'], u.name + (s(fd, 'id') ? ' updated' : ' added') + ' a relief guard duty: ' + what, PAGE, u.id);
  back(PAGE, 'Duty saved: ' + what, true);
}

// Sr. Ops Manager only: remove a duty entry (the guard's details stay on file).
export async function deleteGuardDuty(fd) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.role !== 'om') redirect('/');
  const id = Number(s(fd, 'id'));
  const r = (await q('DELETE FROM pc2_guard_duty WHERE id = $1 RETURNING id', [id]))[0];
  if (r) await logEvent(u, 'delete', 'guard_duty', id, 'Deleted relief guard duty entry #' + id);
  back(PAGE, r ? 'Duty entry removed' : 'Entry not found', !!r);
}
