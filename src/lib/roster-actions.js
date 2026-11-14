'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { notifyRoles, notifyUser } from './notify';
import { ATT_ROLES, allOffices, validDate, todayKey } from './att';
import { DEACT_REASONS, ACT_REASONS } from './hk-status';
import { TLABEL, ALLOWED, holidaysBetween, addDays, siteList } from './roster';
import { OPD_LIMIT } from './hk-opd';
import { teamOf, TEAM_NAME, TEAM_SHORT, siteText } from './teams';
import { syncDk } from './dk-sync';
import { dkOvertime, OT_BLOCK_H, fmt12 } from './dk-hours';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const ROOT = '/attendance/hk-roster';
// The roster page of a team (Dastarkhawan has its own section), with optional extra query values (month...).
const DAST = '/dastarkhawan';
const root = (team, extra = {}) => {
  const p = new URLSearchParams(extra).toString();
  return (team === 'dast' ? DAST : ROOT) + (p ? '?' + p : '');
};

// Only the Sr. Ops Manager and the Sr. Support Officer manage the roster.
// The Dastarkhawan team can also be managed by anyone given the "Dastarkhawan roster" permission (e.g. the Support Officer).
async function need(team = 'support') {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (team === 'dast') {
    if (!['om', 'sso', 'so'].includes(u.role) || !can(u, 'dast_edit')) redirect('/');
    return u;
  }
  if ((u.role !== 'om' && u.role !== 'sso') || !can(u, 'roster_edit')) redirect('/attendance');
  return u;
}
// Anyone who uses AttendTrack may ask for time-off.
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

// Validate the time-off fields and find the team member. Returns { st, kind, from, to, hrs, note } or redirects with an error.
async function readTimeOff(fd, u, here, team = 'support') {
  const name = s(fd, 'name');
  const kind = s(fd, 'kind');
  const from = s(fd, 'from');
  const hrs = s(fd, 'hours') ? Number(s(fd, 'hours')) : null;
  const to = hrs !== null ? from : s(fd, 'to') || from;
  if (!TLABEL[kind]) back(here, 'Choose the type of time-off');
  if (team === 'dast' && kind !== 'pto') back(here, 'Only PTO applies to the Dastarkhawan team');
  if (hrs !== null && !(hrs > 0 && hrs <= 24)) back(here, 'Hours must be more than 0 and at most 24');
  if (!dateOk(from) || !dateOk(to) || to < from) back(here, 'Choose valid dates (the last day cannot be before the first)');
  if ((new Date(to) - new Date(from)) / 864e5 > 120) back(here, 'Time-off can be at most 120 days at once');
  const found = await q('SELECT s.id, s.name, s.office_id FROM pc2_hk_people s WHERE s.active AND s.team = $2 AND lower(s.name) = lower($1)', [name, team]);
  if (!found.length) back(here, 'Nobody in the ' + TEAM_SHORT[team] + ' team is called "' + name + '". Pick a name from the list.');
  if (found.length > 1) back(here, 'More than one ' + TEAM_SHORT[team] + ' team member is called "' + name + '". Ask Mohsin to make the names different.');
  const st = found[0];
  if (team !== 'dast' && !allOffices(u) && st.office_id !== u.office_id) back(here, 'You can only record time-off for your own office');
  // A range made only of holidays needs no time-off.
  const hol = await holidaysBetween(from, to, team);
  let working = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!hol.has(d)) working += 1;
  if (!working) back(here, 'Those days are all holidays, so no time-off is needed');
  // Hours may share a day with other hours; a full day cannot overlap anything that is approved or waiting.
  const clash = await q(
    `SELECT to_char(from_date, 'YYYY-MM-DD') AS f, to_char(to_date, 'YYYY-MM-DD') AS t FROM pc2_hk_off WHERE hk_id = $1 AND status <> 'declined' AND from_date <= $3::date AND to_date >= $2::date ${hrs !== null ? 'AND hours IS NULL' : ''} LIMIT 1`,
    [st.id, from, to]
  );
  if (clash.length) back(here, st.name + ' already has time-off from ' + clash[0].f + ' to ' + clash[0].t + '. Remove it first to change it.');
  return { st, kind, from, to, hrs, note: s(fd, 'note').slice(0, 120) };
}
const span = (a) => a.from + (a.to !== a.from ? ' to ' + a.to : '') + (a.hrs !== null ? ' (' + a.hrs + ' h)' : '');

// Record time-off straight away (Sr. Ops Manager / Sr. Support Officer).
export async function addTimeOff(fd) {
  const team = teamOf(s(fd, 'team'));
  const u = await need(team);
  const m = s(fd, 'month');
  const here = root(team, m ? { m } : {});
  const a = await readTimeOff(fd, u, here, team);
  const r = await q(`INSERT INTO pc2_hk_off (hk_id, from_date, to_date, kind, note, created_by, hours, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved') RETURNING id`, [a.st.id, a.from, a.to, a.kind, a.note, u.id, a.hrs]);
  await logEvent(u, 'create', 'timeoff', r[0].id, 'Time-off: ' + a.st.name + ' ' + TLABEL[a.kind] + ' ' + span(a), null, { kind: a.kind });
  back(here, a.st.name + ': ' + TLABEL[a.kind] + (a.hrs !== null ? ' ' + a.hrs + ' h' : '') + ' recorded', true);
}

// Ask for time-off (anyone). It waits for the Sr. Ops Manager to approve.
export async function requestTimeOff(fd) {
  const u = await needAny();
  if (u.role === 'guard') redirect('/');
  const here = ROOT + '/request';
  const a = await readTimeOff(fd, u, here);
  const r = await q(`INSERT INTO pc2_hk_off (hk_id, from_date, to_date, kind, note, created_by, hours, status, requested_by) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $6) RETURNING id`, [a.st.id, a.from, a.to, a.kind, a.note, u.id, a.hrs]);
  await logEvent(u, 'create', 'timeoff', r[0].id, 'Time-off requested: ' + a.st.name + ' ' + TLABEL[a.kind] + ' ' + span(a), null, { kind: a.kind });
  await notifyRoles(['om'], u.name + ' asked for time-off for ' + a.st.name + ': ' + TLABEL[a.kind] + ' ' + span(a), ROOT, u.id);
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
  await logEvent(u, 'edit', 'timeoff', id, (approve ? 'Approved' : 'Declined') + ' time-off: ' + r.name + ' ' + TLABEL[r.kind] + ' ' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : ''), null, null);
  if (r.requested_by && r.requested_by !== u.id) await notifyUser(r.requested_by, 'Your time-off request for ' + r.name + ' (' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : '') + ') was ' + (approve ? 'approved' : 'declined'), ROOT + '/request');
  back(to, r.name + ': request ' + (approve ? 'approved' : 'declined'), true);
}

export async function deleteTimeOff(fd) {
  const id = Number(s(fd, 'id'));
  const m = s(fd, 'month');
  const r = (await q(`SELECT t.id, t.kind, to_char(t.from_date, 'YYYY-MM-DD') AS f, to_char(t.to_date, 'YYYY-MM-DD') AS t2, s.name, s.office_id, s.team FROM pc2_hk_off t JOIN pc2_hk_people s ON s.id = t.hk_id WHERE t.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  const u = await need(r ? r.team : 'support');
  const here = root(r ? r.team : teamOf(s(fd, 'team')), m ? { m } : {});
  if (!r) back(here, 'That entry no longer exists');
  if (r.team !== 'dast' && !allOffices(u) && r.office_id !== u.office_id) back(here, 'You can only change time-off for your own office');
  await q('DELETE FROM pc2_hk_off WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'timeoff', id, 'Removed time-off: ' + r.name + ' ' + TLABEL[r.kind] + ' ' + r.f + (r.t2 !== r.f ? ' to ' + r.t2 : ''), null, null);
  back(here, 'Time-off removed', true);
}

// Add someone to the support team (they are not on the Employees list and have no attendance entries).
export async function addHkPerson(fd) {
  const team = teamOf(s(fd, 'team'));
  const u = await need(team);
  const here = root(team);
  const name = s(fd, 'name').slice(0, 80);
  if (!name) back(here, 'Enter the name');
  // Dastarkhawan people are mapped to one or more sites from the Sites list (each on chosen weekdays), not to an office. Support people belong to an office.
  const mapped = team === 'dast' ? readSites(fd, await siteList()) : [];
  if (team === 'dast' && !mapped.length) back(here, 'Choose at least one site');
  const site = mapped.length ? mapped[0].site : '';
  let off = null;
  if (team !== 'dast') {
    const code = allOffices(u) ? s(fd, 'office') : u.office_code;
    off = (await q('SELECT id, code FROM pc2_offices WHERE code = $1', [code]))[0];
    if (!off) back(here, 'Choose the office');
    if (!allOffices(u) && off.code !== u.office_code) back(here, 'You can only add people for your own office');
  }
  const dup = await q('SELECT id FROM pc2_hk_people WHERE active AND team = $2 AND lower(name) = lower($1)', [name, team]);
  if (dup.length) back(here, name + ' is already in the ' + TEAM_SHORT[team] + ' team');
  const joined = dateOk(s(fd, 'joined')) ? s(fd, 'joined') : null;
  const bday = dateOk(s(fd, 'birthday')) ? s(fd, 'birthday') : null;
  const r = await q('INSERT INTO pc2_hk_people (name, office_id, role, created_by, phone, joined_on, birthday, team, site) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [name, off ? off.id : null, s(fd, 'role').slice(0, 60), u.id, s(fd, 'phone').slice(0, 30), joined, bday, team, site]);
  if (team === 'dast') await saveSites(r[0].id, mapped);
  await logEvent(u, 'create', 'hk_person', r[0].id, 'Added to the ' + TEAM_NAME[team] + ': ' + name + ' (' + (team === 'dast' ? siteText(mapped) : off.code) + ')', null, null);
  back(here, name + ' added to the ' + TEAM_NAME[team], true);
}

/* ---------- Dastarkhawan sites: added and removed from within the app ---------- */

// The ticked sites of a form with the weekdays ticked for each (none ticked = every day). Only sites on the list count.
function readSites(fd, valid) {
  const picked = [...new Set(fd.getAll('site').map(String).filter((x) => valid.includes(x)))];
  return picked.map((site) => ({ site, days: [...new Set(fd.getAll('days_' + site).map(String).filter((d) => /^[1-7]$/.test(d)))].sort().join(',') }));
}
async function saveSites(personId, list) {
  await q('DELETE FROM pc2_person_sites WHERE person_id = $1', [personId]);
  for (const x of list) await q('INSERT INTO pc2_person_sites (person_id, site, weekdays) VALUES ($1, $2, $3)', [personId, x.site, x.days]);
}

const SITES_PAGE = DAST + '/sites';

// Fetch the latest check-ins from the facial attendance app right now.
export async function refreshDk() {
  await need('dast');
  const r = await syncDk({ force: true });
  if (r.error) back(DAST + '/today', 'Could not reach the facial attendance app (' + r.error + ')');
  back(DAST + '/today', 'Check-ins updated: ' + r.records + ' records from ' + r.staff + ' staff', true);
}

// Remove the link between a Dastarkhawan person and a facial-app staff record (their check-ins from that record stop showing).
export async function unlinkDkPerson(fd) {
  const u = await need('dast');
  const id = Number(s(fd, 'id'));
  const p = (await q(`SELECT id, name, dk_emp_id FROM pc2_hk_people WHERE id = $1 AND active AND team = 'dast'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!p || !p.dk_emp_id) back(DAST + '/today', 'That person is not linked to the facial app');
  await q('UPDATE pc2_hk_people SET dk_emp_id = NULL WHERE id = $1', [id]);
  await logEvent(u, 'edit', 'hk_person', id, 'Unlinked ' + p.name + ' from facial app staff ' + p.dk_emp_id, null, null);
  back(DAST + '/today', p.name + ' unlinked from the facial app (' + p.dk_emp_id + ')', true);
}

// Link a Dastarkhawan person to their staff record in the facial app (matched by name automatically when the names are the same).
export async function linkDkPerson(fd) {
  const u = await need('dast');
  const id = Number(s(fd, 'id'));
  const emp = s(fd, 'emp');
  const p = (await q(`SELECT id, name FROM pc2_hk_people WHERE id = $1 AND active AND team = 'dast'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back(DAST + '/today', 'That person is no longer in the team');
  if (!emp) back(DAST + '/today', 'Choose the facial app staff member for ' + p.name);
  const st = (await q('SELECT emp_id, name FROM pc2_dk_staff WHERE emp_id = $1', [emp]))[0];
  if (!st) back(DAST + '/today', 'That facial app staff member was not found');
  const taken = await q(`SELECT name FROM pc2_hk_people WHERE active AND dk_emp_id = $1 AND id <> $2`, [emp, id]);
  if (taken.length) back(DAST + '/today', st.name + ' is already linked to ' + taken[0].name);
  await q('UPDATE pc2_hk_people SET dk_emp_id = $1 WHERE id = $2', [emp, id]);
  await logEvent(u, 'edit', 'hk_person', id, 'Linked ' + p.name + ' to facial app staff ' + st.emp_id, null, null);
  back(DAST + '/today', p.name + ' linked to ' + st.name + ' (' + st.emp_id + ')', true);
}

export async function addSite(fd) {
  const u = await need('dast');
  const name = s(fd, 'name').replace(/\s+/g, ' ').slice(0, 30);
  if (!name) back(SITES_PAGE, 'Enter the site name');
  const ex = (await q('SELECT id, name, active FROM pc2_sites WHERE lower(name) = lower($1)', [name]))[0];
  if (ex && ex.active) back(SITES_PAGE, ex.name + ' is already a site');
  if (ex) await q('UPDATE pc2_sites SET active = TRUE WHERE id = $1', [ex.id]);
  else await q('INSERT INTO pc2_sites (name) VALUES ($1)', [name]);
  await logEvent(u, 'create', 'site', null, 'Added site ' + name, null, null);
  back(SITES_PAGE, name + ' added', true);
}

// A site can be removed once nobody active is at it (move or remove those people first).
export async function removeSite(fd) {
  const u = await need('dast');
  const id = Number(s(fd, 'id'));
  const st = (await q('SELECT id, name FROM pc2_sites WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!st) back(SITES_PAGE, 'That site is already removed');
  const n = Number((await q(`SELECT COUNT(DISTINCT ps.person_id)::int AS n FROM pc2_person_sites ps JOIN pc2_hk_people p ON p.id = ps.person_id WHERE p.active AND p.team = 'dast' AND ps.site = $1`, [st.name]))[0].n);
  if (n > 0) back(SITES_PAGE, st.name + ' still has ' + n + (n === 1 ? ' person' : ' people') + '. Move or remove them first.');
  await q('UPDATE pc2_sites SET active = FALSE WHERE id = $1', [st.id]);
  await logEvent(u, 'delete', 'site', st.id, 'Removed site ' + st.name, null, null);
  back(SITES_PAGE, st.name + ' removed', true);
}

// Change a team member's details.
export async function updateHkPerson(fd) {
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, office_id, team FROM pc2_hk_people WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  const u = await need(p ? p.team : 'support');
  const here = root(p ? p.team : teamOf(s(fd, 'team')));
  if (!p) back(here, 'That person is no longer in the team');
  if (p.team !== 'dast' && !allOffices(u) && p.office_id !== u.office_id) back(here, 'You can only change your own office');
  const name = s(fd, 'name').slice(0, 80) || p.name;
  const dup = await q('SELECT id FROM pc2_hk_people WHERE active AND team = $3 AND lower(name) = lower($1) AND id <> $2', [name, id, p.team]);
  if (dup.length) back(here, 'Someone else in the team is already called ' + name);
  const joined = dateOk(s(fd, 'joined')) ? s(fd, 'joined') : null;
  const bday = dateOk(s(fd, 'birthday')) ? s(fd, 'birthday') : null;
  await q('UPDATE pc2_hk_people SET name = $1, role = $2, phone = $3, joined_on = $4, birthday = $5 WHERE id = $6', [name, s(fd, 'role').slice(0, 60), s(fd, 'phone').slice(0, 30), joined, bday, id]);
  // A Dastarkhawan member's sites and weekdays can be changed (any sites on the Sites list, one or more).
  if (p.team === 'dast') {
    const mapped = readSites(fd, await siteList());
    if (!mapped.length) back(here, 'Choose at least one site');
    await saveSites(id, mapped);
    await q('UPDATE pc2_hk_people SET site = $1 WHERE id = $2', [mapped[0].site, id]);
  }
  await logEvent(u, 'edit', 'hk_person', id, 'Updated ' + TEAM_SHORT[p.team] + ' team member: ' + name, null, null);
  back(here, name + ' updated', true);
}

// Read the reason, remarks and "with effect from" date of an activation or deactivation. Redirects with a message when something is missing.
function readStatus(fd, list, here) {
  const reason = s(fd, 'reason');
  const remarks = s(fd, 'remarks').slice(0, 200);
  const eff = s(fd, 'eff') || todayKey();
  if (!list.includes(reason)) back(here, 'Choose a reason');
  if (reason === 'Other' && !remarks) back(here, 'Write the remarks when the reason is Other');
  if (!dateOk(eff)) back(here, 'Choose a valid date (with effect from)');
  const t = todayKey();
  if (eff < addDays(t, -730) || eff > addDays(t, 365)) back(here, 'The date must be within the last 2 years or the next year');
  return { reason, remarks, eff, future: eff > t };
}

// Deactivate a team member with a reason, remarks and the date it takes effect (past or today: at once; a future date: on that day).
// Their past time-off and check-ins stay in the database; they leave the roster and can be activated again.
export async function deactivateHkPerson(fd) {
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, office_id, team FROM pc2_hk_people WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  const u = await need(p ? p.team : 'support');
  const here = root(p ? p.team : teamOf(s(fd, 'team')));
  if (!p) back(here, 'That person is no longer active');
  if (p.team !== 'dast' && !allOffices(u) && p.office_id !== u.office_id) back(here, 'You can only change your own office');
  const x = readStatus(fd, DEACT_REASONS, here);
  if (x.future) await q('UPDATE pc2_hk_people SET active_to = $1::date WHERE id = $2', [x.eff, id]);
  else await q('UPDATE pc2_hk_people SET active = FALSE, active_to = NULL, active_from = NULL WHERE id = $1', [id]);
  await q(`INSERT INTO pc2_hk_status_log (person_id, action, reason, remarks, eff_date, by_id) VALUES ($1, 'deactivate', $2, $3, $4::date, $5)`, [id, x.reason, x.remarks, x.eff, u.id]);
  await logEvent(u, 'edit', 'hk_person', id, 'Deactivated ' + p.name + ' (' + TEAM_SHORT[p.team] + ') w.e.f. ' + x.eff + ': ' + x.reason + (x.remarks ? ' - ' + x.remarks : ''), null, null);
  back(here, p.name + (x.future ? ' will be deactivated w.e.f. ' : ' deactivated w.e.f. ') + x.eff + ' (' + x.reason + ')', true);
}

// Activate a deactivated team member again (re-hired, re-joined...) with remarks and the date it takes effect.
export async function activateHkPerson(fd) {
  const id = Number(s(fd, 'id'));
  const p = (await q('SELECT id, name, office_id, team FROM pc2_hk_people WHERE id = $1 AND NOT active', [Number.isInteger(id) ? id : 0]))[0];
  const u = await need(p ? p.team : 'support');
  const here = root(p ? p.team : teamOf(s(fd, 'team')));
  if (!p) back(here, 'That person is already active');
  if (p.team !== 'dast' && !allOffices(u) && p.office_id !== u.office_id) back(here, 'You can only change your own office');
  const x = readStatus(fd, ACT_REASONS, here);
  const dup = await q('SELECT id FROM pc2_hk_people WHERE active AND team = $2 AND lower(name) = lower($1) AND id <> $3', [p.name, p.team, id]);
  if (dup.length) back(here, 'Someone called ' + p.name + ' is already active in the ' + TEAM_SHORT[p.team] + ' team');
  if (x.future) await q('UPDATE pc2_hk_people SET active_from = $1::date WHERE id = $2', [x.eff, id]);
  else await q('UPDATE pc2_hk_people SET active = TRUE, active_from = NULL, active_to = NULL WHERE id = $1', [id]);
  await q(`INSERT INTO pc2_hk_status_log (person_id, action, reason, remarks, eff_date, by_id) VALUES ($1, 'activate', $2, $3, $4::date, $5)`, [id, x.reason, x.remarks, x.eff, u.id]);
  await logEvent(u, 'edit', 'hk_person', id, 'Activated ' + p.name + ' (' + TEAM_SHORT[p.team] + ') w.e.f. ' + x.eff + ': ' + x.reason + (x.remarks ? ' - ' + x.remarks : ''), null, null);
  back(here, p.name + (x.future ? ' will be activated w.e.f. ' : ' activated w.e.f. ') + x.eff + ' (' + x.reason + ')', true);
}

// Dastarkhawan holidays are added by hand (there is no gazetted calendar for it). They show on its roster and are not counted as time-off.
export async function addDkHoliday(fd) {
  const u = await need('dast');
  const day = s(fd, 'day');
  const name = s(fd, 'name').slice(0, 80);
  if (!dateOk(day)) back(DAST, 'Choose the date of the holiday');
  if (!name) back(DAST, 'Enter the name of the holiday');
  await q('INSERT INTO pc2_dk_holidays (day, name, by_id) VALUES ($1::date, $2, $3) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name, by_id = EXCLUDED.by_id', [day, name, u.id]);
  await logEvent(u, 'create', 'holiday', null, 'Dastarkhawan holiday: ' + day + ' ' + name, null, null);
  back(DAST + '?m=' + day.slice(0, 7), name + ' (' + day + ') added to the Dastarkhawan holidays', true);
}

export async function removeDkHoliday(fd) {
  const u = await need('dast');
  const day = s(fd, 'day');
  if (!dateOk(day)) back(DAST, 'That holiday was not found');
  const r = await q('DELETE FROM pc2_dk_holidays WHERE day = $1::date RETURNING name', [day]);
  if (r.length) await logEvent(u, 'delete', 'holiday', null, 'Removed Dastarkhawan holiday: ' + day + ' ' + r[0].name, null, null);
  back(DAST + '?m=' + day.slice(0, 7), 'Holiday removed', true);
}

// Dastarkhawan: the yearly PTO allowance of one person (days). Empty clears it.
export async function setDkAllowance(fd) {
  const u = await need('dast');
  const id = Number(s(fd, 'id'));
  const year = Number(s(fd, 'year'));
  const here = DAST + '/balances?y=' + (Number.isInteger(year) ? year : '');
  const p = (await q(`SELECT id, name FROM pc2_hk_people WHERE id = $1 AND team = 'dast'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!p || !(year >= 2000 && year <= 2100)) back(here, 'That person was not found');
  const raw = s(fd, 'days');
  if (raw === '') {
    await q(`DELETE FROM pc2_hk_allow WHERE person_id = $1 AND year = $2 AND kind = 'pto'`, [id, year]);
    back(here, p.name + ': ' + year + ' PTO allowance cleared', true);
  }
  const days = Number(raw);
  if (!(days >= 0 && days <= 365)) back(here, 'Days must be between 0 and 365');
  await q(`INSERT INTO pc2_hk_allow (person_id, year, kind, days) VALUES ($1, $2, 'pto', $3) ON CONFLICT (person_id, year, kind) DO UPDATE SET days = EXCLUDED.days`, [id, year, days]);
  await logEvent(u, 'edit', 'hk_person', id, p.name + ': ' + year + ' PTO allowance set to ' + days + ' days', null, null);
  back(here, p.name + ': ' + year + ' PTO allowance is ' + days + ' days', true);
}

// Dastarkhawan: give everyone active the same yearly PTO allowance (days) for a year; each person can then be changed on their own.
export async function setDkAllowanceAll(fd) {
  const u = await need('dast');
  const year = Number(s(fd, 'year'));
  const days = Number(s(fd, 'days'));
  const here = DAST + '/balances?y=' + (Number.isInteger(year) ? year : '');
  if (!(year >= 2000 && year <= 2100) || s(fd, 'days') === '' || !(days >= 0 && days <= 365)) back(here, 'Enter the days (0 to 365)');
  await q(
    `INSERT INTO pc2_hk_allow (person_id, year, kind, days) SELECT id, $1, 'pto', $2 FROM pc2_hk_people WHERE active AND team = 'dast'
     ON CONFLICT (person_id, year, kind) DO UPDATE SET days = EXCLUDED.days`,
    [year, days]
  );
  await logEvent(u, 'edit', 'hk_person', null, 'Dastarkhawan: ' + year + ' PTO allowance set to ' + days + ' days for everyone active', null, null);
  back(here, year + ' PTO allowance set to ' + days + ' days for everyone', true);
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

// Dastarkhawan: turns a person's available overtime into PTO days (every 8 overtime hours = 1 day) for the current year. Sr. Ops Manager only.
export async function convertOvertime(fd) {
  const u = await need('dast');
  const here = DAST + '/attendance?m=' + encodeURIComponent(s(fd, 'm'));
  if (u.role !== 'om') back(here, 'Only the Sr. Ops Manager can convert overtime to PTO');
  const id = Number(s(fd, 'id'));
  const p = (await q(`SELECT id, name FROM pc2_hk_people WHERE id = $1 AND team = 'dast'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back(here, 'That person was not found');
  const ot = (await dkOvertime()).get(id);
  if (!ot || ot.days < 1) back(here, p.name + ' has less than ' + OT_BLOCK_H + ' overtime hours to convert');
  const year = Number(todayKey().slice(0, 4));
  const hours = ot.days * OT_BLOCK_H;
  await q(`INSERT INTO pc2_hk_ot_conv (person_id, year, hours, days, by_id) VALUES ($1, $2, $3, $4, $5)`, [id, year, hours, ot.days, u.id]);
  await q(`INSERT INTO pc2_hk_allow (person_id, year, kind, days) VALUES ($1, $2, 'pto', $3) ON CONFLICT (person_id, year, kind) DO UPDATE SET days = pc2_hk_allow.days + EXCLUDED.days`, [id, year, ot.days]);
  await logEvent(u, 'edit', 'hk_person', id, p.name + ': ' + hours + ' overtime hours converted to ' + ot.days + ' PTO day(s) for ' + year, null, null);
  back(here, p.name + ': ' + hours + ' overtime hours converted to ' + ot.days + ' PTO day(s) (' + year + ' allowance)', true);
}

// Dastarkhawan: type in (or correct) the check in / check out of one person for one day, for when the facial app has no time,
// and/or pick which of the person's sites they spent that day at.
export async function saveDkTime(fd) {
  const u = await need('dast');
  const m = s(fd, 'm');
  const v = ['sites', 'ot'].includes(s(fd, 'v')) ? '&v=' + s(fd, 'v') : '';
  const here = DAST + '/attendance?m=' + encodeURIComponent(m) + v;
  const id = Number(s(fd, 'id'));
  const p = (await q(`SELECT id, name FROM pc2_hk_people WHERE id = $1 AND team = 'dast'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!p) back(here, 'Pick a team member');
  const day = s(fd, 'day');
  if (!dateOk(day) || day > todayKey()) back(here, 'Pick a date that is not in the future');
  const ci = s(fd, 'in') ? fmt12(s(fd, 'in')) : '';
  const co = s(fd, 'out') ? fmt12(s(fd, 'out')) : '';
  if ((s(fd, 'in') && !ci) || (s(fd, 'out') && !co)) back(here, 'That time is not valid');
  const site = s(fd, 'site');
  if (!ci && !co && !site) back(here, 'Enter a check in time, a check out time, a site, or a combination');
  const note = s(fd, 'note').slice(0, 200);
  const where = DAST + '/attendance?m=' + encodeURIComponent(day.slice(0, 7)) + v;
  const said = [];
  if (ci || co) {
    await q(
      `INSERT INTO pc2_dk_manual (person_id, day, check_in, check_out, note, by_id, at) VALUES ($1, $2::date, $3, $4, $5, $6, now())
       ON CONFLICT (person_id, day) DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, note = EXCLUDED.note, by_id = EXCLUDED.by_id, at = now()`,
      [id, day, ci, co, note, u.id]
    );
    await logEvent(u, 'edit', 'hk_person', id, p.name + ': ' + day + ' time entered by hand (in ' + (ci || '-') + ', out ' + (co || '-') + ')' + (note ? ' - ' + note : ''), null, null);
    said.push((ci || '-') + ' to ' + (co || '-'));
  }
  if (site === '-') {
    await q(`DELETE FROM pc2_dk_sitedays WHERE person_id = $1 AND day = $2::date`, [id, day]);
    await logEvent(u, 'edit', 'hk_person', id, p.name + ': ' + day + ' site removed', null, null);
    said.push('site removed');
  } else if (site) {
    const ok = (await q(`SELECT 1 FROM pc2_person_sites WHERE person_id = $1 AND site = $2`, [id, site]))[0];
    if (!ok) back(where, p.name + ' is not mapped to ' + site + ' (set the sites on the roster first)');
    await q(
      `INSERT INTO pc2_dk_sitedays (person_id, day, site, by_id, at) VALUES ($1, $2::date, $3, $4, now())
       ON CONFLICT (person_id, day) DO UPDATE SET site = EXCLUDED.site, by_id = EXCLUDED.by_id, at = now()`,
      [id, day, site, u.id]
    );
    await logEvent(u, 'edit', 'hk_person', id, p.name + ': ' + day + ' spent at ' + site, null, null);
    said.push('at ' + site);
  }
  back(where, p.name + ': ' + day + ' saved (' + said.join(', ') + ')', true);
}

// Dastarkhawan: removes a hand-typed time, so the facial-app time (if any) shows again.
export async function clearDkTime(fd) {
  const u = await need('dast');
  const day = s(fd, 'day');
  const here = DAST + '/attendance?m=' + encodeURIComponent(day.slice(0, 7));
  const id = Number(s(fd, 'id'));
  const p = (await q(`SELECT id, name FROM pc2_hk_people WHERE id = $1 AND team = 'dast'`, [Number.isInteger(id) ? id : 0]))[0];
  if (!p || !dateOk(day)) back(here, 'That entry was not found');
  await q(`DELETE FROM pc2_dk_manual WHERE person_id = $1 AND day = $2::date`, [id, day]);
  await logEvent(u, 'delete', 'hk_person', id, p.name + ': ' + day + ' hand-typed time removed', null, null);
  back(here, p.name + ': ' + day + ' hand-typed time removed', true);
}
