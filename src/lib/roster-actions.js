'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { notifyRoles, notifyUser } from './notify';
import { ATT_ROLES, allOffices, validDate } from './att';
import { TLABEL, ALLOWED, holidaysBetween, addDays } from './roster';
import { OPD_LIMIT } from './hk-opd';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const ROOT = '/attendance/hk-roster';

// Only the Sr. Ops Manager and the Sr. Support Officer manage the roster.
async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if ((u.role !== 'om' && u.role !== 'sso') || !can(u, 'roster_edit')) redirect('/attendance');
  return u;
}
// Anyone who uses AttendTrack may ask for time off.
async function needAny() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!ATT_ROLES.includes(u.role)) redirect('/');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}
const dateOk = (d) => validDate(String(d || ''));

// Validate the time off fields and find the team member. Returns { st, kind, from, to, hrs, note } or redirects with an error.
async function readTimeOff(fd, u, here) {
  const name = s(fd, 'name');
  const kind = s(fd, 'kind');
  const from = s(fd, 'from');
  const hrs = s(fd, 'hours') ? Number(s(fd, 'hours')) : null;
  const to = hrs !== null ? from : s(fd, 'to') || from;
  if (!TLABEL[kind]) back(here, 'Choose the type of time off');
  if (hrs !== null && !(hrs > 0 && hrs <= 24)) back(here, 'Hours must be more than 0 and at most 24');
  if (!dateOk(from) || !dateOk(to) || to < from) back(here, 'Choose valid dates (the last day cannot be before the first)');
  if ((new Date(to) - new Date(from)) / 864e5 > 120) back(here, 'Time off can be at most 120 days at once');
  const found = await q('SELECT s.id, s.name, s.office_id FROM pc2_hk_people s WHERE s.active AND lower(s.name) = lower($1)', [name]);
  if (!found.length) back(here, 'Nobody in the Support team is called "' + name + '". Pick a name from the list.');
  if (found.length > 1) back(here, 'More than one Support team member is called "' + name + '". Ask Mohsin to make the names different.');
  const st = found[0];
  if (!allOffices(u) && st.office_id !== u.office_id) back(here, 'You can only record time off for your own office');
  // A range made only of holidays needs no time off.
  const hol = await holidaysBetween(from, to);
  let working = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!hol.has(d)) working += 1;
  if (!working) back(here, 'Those days are all holidays, so no time off is needed');
  // Hours may share a day with other hours; a full day cannot overlap anything that is approved or waiting.
  const clash = await q(
    `SELECT to_char(from_date, 'YYYY-MM-DD') AS f, to_char(to_date, 'YYYY-MM-DD') AS t FROM pc2_hk_off WHERE hk_id = $1 AND status <> 'declined' AND from_date <= $3::date AND to_date >= $2::date ${hrs !== null ? 'AND hours IS NULL' : ''} LIMIT 1`,
    [st.id, from, to]
  );
  if (clash.length) back(here, st.name + ' already has time off from ' + clash[0].f + ' to ' + clash[0].t + '. Remove it first to change it.');
  return { st, kind, from, to, hrs, note: s(fd, 'note').slice(0, 120) };
}
const span = (a) => a.from + (a.to !== a.from ? ' to ' + a.to : '') + (a.hrs !== null ? ' (' + a.hrs + ' h)' : '');

// Record time off straight away (Sr. Ops Manager / Sr. Support Officer).
export async function addTimeOff(fd) {
  const u = await need();
  const m = s(fd, 'month');
  const here = ROOT + (m ? '?m=' + m : '');
  const a = await readTimeOff(fd, u, here);
  const r = await q(`INSERT INTO pc2_hk_off (hk_id, from_date, to_date, kind, note, created_by, hours, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved') RETURNING id`, [a.st.id, a.from, a.to, a.kind, a.note, u.id, a.hrs]);
  await logEvent(u, 'create', 'timeoff', r[0].id, 'Time off: ' + a.st.name + ' ' + TLABEL[a.kind] + ' ' + span(a), null, { kind: a.kind });
  back(here, a.st.name + ': ' + TLABEL[a.kind] + (a.hrs !== null ? ' ' + a.hrs + ' h' : '') + ' recorded', true);
}

// Ask for time off (anyone). It waits for the Sr. Ops Manager to approve.
export async function requestTimeOff(fd) {
  const u = await needAny();
  const here = ROOT + '/request';
  const a = await readTimeOff(fd, u, here);
  const r = await q(`INSERT INTO pc2_hk_off (hk_id, from_date, to_date, kind, note, created_by, hours, status, requested_by) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $6) RETURNING id`, [a.st.id, a.from, a.to, a.kind, a.note, u.id, a.hrs]);
  await logEvent(u, 'create', 'timeoff', r[0].id, 'Time off requested: ' + a.st.name + ' ' + TLABEL[a.kind] + ' ' + span(a), null, { kind: a.kind });
  await notifyRoles(['om'], u.name + ' asked for time off for ' + a.st.name + ': ' + TLABEL[a.kind] + ' ' + span(a), ROOT, u.id);
  back(here, 'Request sent for ' + a.st.name + '. You will be told when it is approved or declined.', true);
}

// Approve or decline a request. Only the Sr. Ops Manager decides.
export async function decideTimeOff(fd) {
  const u = await need();
  if (u.role !== 'om') redirect(ROOT);
  const id = Number(s(fd, 'id'));
  const approve = s(fd, 'decision') === 'approve';
  const to = s(fd, 'back') === '/approvals' ? '/approvals' : ROOT;
  const r = (await q(`SELECT t.id, t.kind, t.requested_by, to_char(t.from_date, 'YYYY-MM-DD') AS f, to_char(t.to_date, 'YYYY-MM-DD') AS t2, s.name FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id WHERE t.id = $1 AND t.status = 'pending'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!r) back(to, 'That request was already handled');
  await q(`UPDATE pc2_hk_off SET status = $1, decided_by = $2, decided_at = now() WHERE id = $3`, [approve ? 'approved' : 'declined', u.id, id]);
  await logEvent(u, 'edit', 'timeoff', id, (approve ? 'Approved' : 'Declined') + ' time off: ' + r.name + ' ' + TLABEL[r.kind] + ' ' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : ''), null, null);
  if (r.requested_by && r.requested_by !== u.id) await notifyUser(r.requested_by, 'Your time off request for ' + r.name + ' (' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : '') + ') was ' + (approve ? 'approved' : 'declined'), ROOT + '/request');
  back(to, r.name + ': request ' + (approve ? 'approved' : 'declined'), true);
}

export async function deleteTimeOff(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const m = s(fd, 'month');
  const here = ROOT + (m ? '?m=' + m : '');
  const r = (await q(`SELECT t.id, t.kind, to_char(t.from_date, 'YYYY-MM-DD') AS f, to_char(t.to_date, 'YYYY-MM-DD') AS t2, s.name, s.office_id FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id WHERE t.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!r) back(here, 'That entry no longer exists');
  if (!allOffices(u) && r.office_id !== u.office_id) back(here, 'You can only change time off for your own office');
  await q('DELETE FROM pc2_hk_off WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'timeoff', id, 'Removed time off: ' + r.name + ' ' + TLABEL[r.kind] + ' ' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : ''), null, null);
  back(here, 'Time off removed', true);
}

// Add someone to the support team (they are not on the Employees list and have no attendance entries).
export async function addHkPerson(fd) {
  const u = await need();
  const name = s(fd, 'name').slice(0, 80);
  if (!name) back(ROOT, 'Enter the name');
  const code = allOffices(u) ? s(fd, 'office') : u.office_code;
  const off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [code]))[0];
  if (!off) back(ROOT, 'Choose the office');
  const dup = await q('SELECT id FROM pc2_hk_people WHERE active AND lower(name) = lower($1)', [name]);
  if (dup.length) back(ROOT, name + ' is already in the Support team');
  const joined = dateOk(s(fd, 'joined')) ? s(fd, 'joined') : null;
  const bday = dateOk(s(fd, 'birthday')) ? s(fd, 'birthday') : null;
  const r = await q('INSERT INTO pc2_hk_people (name, office_id, role, created_by, phone, joined_on, birthday) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [name, off.id, s(fd, 'role').slice(0, 60), u.id, s(fd, 'phone').slice(0, 30), joined, bday]);
  await logEvent(u, 'create', 'hk_person', r[0].id, 'Added to the Support team: ' + name + ' (' + off.code + ')', null, null);
  back(ROOT, name + ' added to the Support team', true);
}

// Change a team member's details.
export async function updateHkPerson(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, office_id FROM pc2_hk_people WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back(ROOT, 'That person is no longer in the team');
  if (!allOffices(u) && p.office_id !== u.office_id) back(ROOT, 'You can only change your own office');
  const name = s(fd, 'name').slice(0, 80) || p.name;
  const dup = await q('SELECT id FROM pc2_hk_people WHERE active AND lower(name) = lower($1) AND id <> $2', [name, id]);
  if (dup.length) back(ROOT, 'Someone else in the team is already called ' + name);
  const joined = dateOk(s(fd, 'joined')) ? s(fd, 'joined') : null;
  const bday = dateOk(s(fd, 'birthday')) ? s(fd, 'birthday') : null;
  await q('UPDATE pc2_hk_people SET name = $1, role = $2, phone = $3, joined_on = $4, birthday = $5 WHERE id = $6', [name, s(fd, 'role').slice(0, 60), s(fd, 'phone').slice(0, 30), joined, bday, id]);
  await logEvent(u, 'edit', 'hk_person', id, 'Updated Support team member: ' + name, null, null);
  back(ROOT, name + ' updated', true);
}

// Remove someone from the team (their past time off stays in the database but is out of view).
export async function removeHkPerson(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, office_id FROM pc2_hk_people WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back(ROOT, 'That person is no longer in the team');
  if (!allOffices(u) && p.office_id !== u.office_id) back(ROOT, 'You can only change your own office');
  await q('UPDATE pc2_hk_people SET active = FALSE WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'hk_person', id, 'Removed from the Support team: ' + p.name, null, null);
  back(ROOT, p.name + ' removed from the Support team', true);
}

/* ---------- setup: allowances, hours per day, minimum cover, holidays ---------- */

export async function saveSettings(fd) {
  const u = await need();
  const here = ROOT + '/setup';
  const vals = {};
  for (const k of [...ALLOWED, 'hpd', 'min_LHR', 'min_ISB']) {
    const raw = s(fd, k);
    const n = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 366) back(here, 'Enter a number between 0 and 366 for each setting');
    vals[k] = k === 'hpd' && n === 0 ? 8 : n;
  }
  for (const [k, v] of Object.entries(vals)) {
    await q('INSERT INTO pc2_hk_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, String(v)]);
  }
  await logEvent(u, 'edit', 'hk_settings', null, 'Updated the Support roster settings', null, vals);
  back(here, 'Settings saved', true);
}

export async function addHoliday(fd) {
  const u = await need();
  const day = s(fd, 'day');
  const name = s(fd, 'name').slice(0, 80);
  const here = ROOT + '/setup' + (dateOk(day) ? '?y=' + day.slice(0, 4) : '');
  if (!dateOk(day)) back(here, 'Choose a valid date');
  if (!name) back(here, 'Enter the holiday name');
  await q('INSERT INTO pc2_holidays (day, name, created_by) VALUES ($1, $2, $3) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name', [day, name, u.id]);
  await logEvent(u, 'create', 'holiday', null, 'Holiday added: ' + name + ' ' + day, null, null);
  back(here, name + ' added', true);
}

export async function removeHoliday(fd) {
  const u = await need();
  const day = s(fd, 'day');
  const here = ROOT + '/setup' + (dateOk(day) ? '?y=' + day.slice(0, 4) : '');
  if (!dateOk(day)) back(here, 'Choose a valid date');
  await q('DELETE FROM pc2_holidays WHERE day = $1', [day]);
  await logEvent(u, 'delete', 'holiday', null, 'Holiday removed: ' + day, null, null);
  back(here, 'Holiday removed', true);
}

/* ---------- OPD claims for the Support team ---------- */

// Record an OPD claim. The yearly limit (same for everyone) cannot be exceeded; reaching 80% sends an alert.
export async function addOpdClaim(fd) {
  const u = await need();
  const year = s(fd, 'year');
  const here = ROOT + '/opd' + (/^\d{4}$/.test(year) ? '?y=' + year : '');
  const id = Number(s(fd, 'hk_id'));
  const date = s(fd, 'date');
  const amount = Math.round(Number(s(fd, 'amount')) * 100) / 100;
  if (!dateOk(date)) back(here, 'Choose a valid date');
  if (!(amount > 0)) back(here, 'Enter the amount of the claim');
  const p = (await q('SELECT id, name, office_id FROM pc2_hk_people WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back(here, 'Choose a team member');
  if (!allOffices(u) && p.office_id !== u.office_id) back(here, 'You can only record claims for your own office');
  const y = date.slice(0, 4);
  const used = Number((await q('SELECT COALESCE(SUM(amount), 0)::float8 AS v FROM pc2_hk_opd WHERE hk_id = $1 AND claim_date >= $2::date AND claim_date <= $3::date', [p.id, y + '-01-01', y + '-12-31']))[0].v);
  if (used + amount > OPD_LIMIT) back(here, p.name + ' has only PKR ' + Math.max(0, OPD_LIMIT - used).toLocaleString('en-US') + ' of the ' + y + ' OPD limit left, so this claim cannot be added');
  const r = await q('INSERT INTO pc2_hk_opd (hk_id, claim_date, amount, note, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id', [p.id, date, amount, s(fd, 'note').slice(0, 120), u.id]);
  await logEvent(u, 'create', 'hk_opd', r[0].id, 'OPD claim: ' + p.name + ' PKR ' + amount.toLocaleString('en-US') + ' on ' + date, null, { amount, date });
  // Alert when a person crosses 80% (and again when the limit is used up).
  const after = used + amount;
  const left = OPD_LIMIT - after;
  if (after >= OPD_LIMIT && used < OPD_LIMIT) {
    await notifyRoles(['om', 'sso'], p.name + ' has used the whole ' + y + ' OPD limit (PKR ' + OPD_LIMIT.toLocaleString('en-US') + ')', ROOT + '/opd?y=' + y, u.id);
  } else if (after >= 0.8 * OPD_LIMIT && used < 0.8 * OPD_LIMIT) {
    await notifyRoles(['om', 'sso'], p.name + ' has used ' + Math.round((after / OPD_LIMIT) * 100) + '% of the ' + y + ' OPD limit. PKR ' + Math.round(left).toLocaleString('en-US') + ' is left.', ROOT + '/opd?y=' + y, u.id);
  }
  back(ROOT + '/opd?y=' + y, p.name + ': PKR ' + amount.toLocaleString('en-US') + ' recorded' + (after >= 0.8 * OPD_LIMIT ? '. This is now ' + Math.round((after / OPD_LIMIT) * 100) + '% of the yearly limit.' : ''), true);
}

export async function deleteOpdClaim(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const here = ROOT + '/opd' + (/^\d{4}$/.test(s(fd, 'year')) ? '?y=' + s(fd, 'year') : '');
  const c = (await q(`SELECT c.id, c.amount::float8 AS amount, to_char(c.claim_date, 'YYYY-MM-DD') AS d, s.name, s.office_id FROM pc2_hk_opd c JOIN pc2_hk_people s ON s.id = c.hk_id WHERE c.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!c) back(here, 'That claim no longer exists');
  if (!allOffices(u) && c.office_id !== u.office_id) back(here, 'You can only change your own office');
  await q('DELETE FROM pc2_hk_opd WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'hk_opd', id, 'Removed OPD claim: ' + c.name + ' PKR ' + c.amount.toLocaleString('en-US') + ' on ' + c.d, null, null);
  back(here, 'Claim removed', true);
}