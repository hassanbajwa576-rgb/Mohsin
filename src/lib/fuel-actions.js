'use server';

import { redirect } from 'next/navigation';
import { q } from './db';
import { getUser } from './auth';
import { logEvent } from './audit';
import { can } from './perms';
import { notifyRoles, notifyUser } from './notify';
import { validDate, validTime } from './att';
import { FKIND, fuelScope, canEditFuel, seesBalance } from './fuel';

const s = (fd, k) => String(fd.get(k) ?? '').trim();
const pkr = (n) => {
  const v = Number(n) || 0;
  const frac = Math.abs(v - Math.round(v)) > 0.004;
  return 'PKR ' + (frac ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('en-US'));
};

async function need() {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.totp_required && !u.totp_enabled) redirect('/security');
  if (!can(u, 'fuel_use')) redirect('/');
  return u;
}
async function needOm() {
  const u = await need();
  if (u.role !== 'om') redirect('/fuel');
  return u;
}
function back(path, msg, ok) {
  redirect(path + (path.includes('?') ? '&' : '?') + (ok ? 'ok=' : 'err=') + encodeURIComponent(msg));
}
const balanceOf = async (id) =>
  Number((await q(`SELECT COALESCE(SUM(CASE WHEN kind IN ('topup', 'opening') THEN amount WHEN kind = 'fill' THEN -amount END), 0)::float8 AS v FROM pc2_fuel_txn WHERE asset_id = $1`, [id]))[0].v);

// Record fuel filled from a card, a top-up of a card, or a card's opening balance.
export async function addFuel(fd) {
  const u = await need();
  const here = '/fuel';
  const id = Number(s(fd, 'asset'));
  const kind = seesBalance(u) ? s(fd, 'kind') : 'fill';
  const amount = Math.round(Number(s(fd, 'amount')) * 100) / 100;
  const litres = s(fd, 'litres') ? Number(s(fd, 'litres')) : null;
  const reading = s(fd, 'reading') ? Number(s(fd, 'reading')) : null;
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!FKIND[kind]) back(here, 'Choose what you are recording');
  if (!(amount > 0)) back(here, 'Enter the amount in rupees');
  if (litres !== null && !(litres > 0)) back(here, 'Litres must be more than 0');
  if (reading !== null && !(reading >= 0)) back(here, 'Enter the meter reading as a number');
  if (!validDate(date) || !validTime(time)) back(here, 'Choose a valid date and time');
  const a = (await q('SELECT id, name, low_at::float8 AS low_at FROM pc2_fuel_assets WHERE id = $1 AND active', [Number.isInteger(id) ? id : 0]))[0];
  if (!a) back(here, 'Choose the card');
  const scope = await fuelScope(u);
  if (scope && !scope.includes(a.id)) back(here, 'You can only record fuel for your own card');
  const ms = Number((await q(`SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`, [date, time]))[0].ms);
  if (ms > Date.now() + 60000) back(here, 'That time is in the future');

  const before = await balanceOf(a.id);
  const r = await q(
    `INSERT INTO pc2_fuel_txn (asset_id, kind, amount, litres, reading, at, note, created_by) VALUES ($1, $2, $3, $4, $5, ($6::date + $7::time) AT TIME ZONE 'Asia/Karachi', $8, $9) RETURNING id`,
    [a.id, kind, amount, kind === 'fill' ? litres : null, kind === 'fill' ? reading : null, date, time, s(fd, 'note').slice(0, 120), u.id]
  );
  const after = kind === 'fill' ? before - amount : before + amount;
  await logEvent(u, 'create', 'fuel', r[0].id, FKIND[kind] + ': ' + a.name + ' ' + pkr(amount) + (litres ? ' (' + litres + ' L)' : ''), null, { kind, amount });
  // Tell the Sr. Ops Manager and the Sr. Support Officer the moment a card drops below its refill level.
  if (kind === 'fill' && before >= a.low_at && after < a.low_at) {
    await notifyRoles(['om', 'sso'], a.name + ' fuel card is low: ' + pkr(after) + ' left. Refill it (the level is ' + pkr(a.low_at) + ').', '/fuel', u.id);
    // Whoever uses this card is told it is running low, without any amount.
    const users = await q("SELECT f.user_id FROM pc2_fuel_access f JOIN pc2_users x ON x.id = f.user_id WHERE f.asset_id = $1 AND x.active AND x.role NOT IN ('om', 'sso')", [a.id]);
    for (const r of users) await notifyUser(r.user_id, a.name + ' fuel card is running low. Please tell Mohsin or Imran.', '/fuel');
  }
  const low = kind === 'fill' && after < a.low_at;
  if (!seesBalance(u)) back(here, a.name + ': fuel ' + pkr(amount) + ' recorded.', true);
  back(here, a.name + ': ' + FKIND[kind].toLowerCase() + ' ' + pkr(amount) + ' recorded. Balance ' + pkr(after) + (low ? '. The card is now low and needs a refill.' : '.'), true);
}

// Correct an entry. Mohsin and Imran can change any entry; anyone else only the entries they recorded, on their own cards.
export async function editFuel(fd) {
  const u = await need();
  const id = Number(s(fd, 'id'));
  const here = '/fuel/edit?id=' + id;
  const t = (await q('SELECT t.id, t.created_by, t.kind, t.amount::float8 AS amount, a.name FROM pc2_fuel_txn t JOIN pc2_fuel_assets a ON a.id = t.asset_id WHERE t.id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!t) back('/fuel/log', 'That entry no longer exists');
  if (!canEditFuel(u, t)) back('/fuel/log', 'You can change only the entries you recorded yourself');
  const kind = seesBalance(u) ? s(fd, 'kind') : 'fill';
  const amount = Math.round(Number(s(fd, 'amount')) * 100) / 100;
  const litres = s(fd, 'litres') ? Number(s(fd, 'litres')) : null;
  const reading = s(fd, 'reading') ? Number(s(fd, 'reading')) : null;
  const date = s(fd, 'date');
  const time = s(fd, 'time');
  if (!FKIND[kind]) back(here, 'Choose what you are recording');
  if (!(amount > 0)) back(here, 'Enter the amount in rupees');
  if (litres !== null && !(litres > 0)) back(here, 'Litres must be more than 0');
  if (reading !== null && !(reading >= 0)) back(here, 'Enter the meter reading as a number');
  if (!validDate(date) || !validTime(time)) back(here, 'Choose a valid date and time');
  const assetId = Number(s(fd, 'asset'));
  const a = (await q('SELECT id, name FROM pc2_fuel_assets WHERE id = $1 AND active', [Number.isInteger(assetId) ? assetId : 0]))[0];
  if (!a) back(here, 'Choose the card');
  const scope = await fuelScope(u);
  if (scope && !scope.includes(a.id)) back(here, 'You can only use your own card');
  const ms = Number((await q(`SELECT (extract(epoch from (($1::date + $2::time) AT TIME ZONE 'Asia/Karachi')) * 1000)::float8 AS ms`, [date, time]))[0].ms);
  if (ms > Date.now() + 60000) back(here, 'That time is in the future');
  await q(
    `UPDATE pc2_fuel_txn SET asset_id = $1, kind = $2, amount = $3, at = ($4::date + $5::time) AT TIME ZONE 'Asia/Karachi', note = $6 WHERE id = $7`,
    [a.id, kind, amount, date, time, s(fd, 'note').slice(0, 120), id]
  );
  await logEvent(u, 'edit', 'fuel', id, 'Edited fuel entry: ' + t.name + ' ' + FKIND[t.kind] + ' ' + pkr(t.amount) + ' to ' + a.name + ' ' + FKIND[kind] + ' ' + pkr(amount), null, { kind, amount });
  back('/fuel/log', a.name + ': entry updated', true);
}

// Sr. Ops Manager: remove a wrong entry.
export async function deleteFuel(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const t = (await q(`SELECT t.id, t.kind, t.amount::float8 AS amount, a.name FROM pc2_fuel_txn t JOIN pc2_fuel_assets a ON a.id = t.asset_id WHERE t.id = $1`, [Number.isInteger(id) ? id : 0]))[0];
  if (!t) back('/fuel/log', 'That entry no longer exists');
  await q('DELETE FROM pc2_fuel_txn WHERE id = $1', [id]);
  await logEvent(u, 'delete', 'fuel', id, 'Removed fuel entry: ' + t.name + ' ' + FKIND[t.kind] + ' ' + pkr(t.amount), null, null);
  back('/fuel/log', 'Entry removed', true);
}

// Sr. Ops Manager: the level at which a card counts as low, and adding a card or vehicle.
export async function saveFuelLevel(fd) {
  const u = await needOm();
  const id = Number(s(fd, 'id'));
  const low = Number(s(fd, 'low_at'));
  const name = s(fd, 'name').slice(0, 60);
  if (!(low >= 0)) back('/fuel/setup', 'Enter the low level in rupees');
  const a = (await q('SELECT id, name FROM pc2_fuel_assets WHERE id = $1', [Number.isInteger(id) ? id : 0]))[0];
  if (!a) back('/fuel/setup', 'That card no longer exists');
  await q('UPDATE pc2_fuel_assets SET low_at = $1, name = $2 WHERE id = $3', [low, name || a.name, id]);
  // Who besides Mohsin and Imran can see this card. They get the FuelTrack access automatically.
  const want = [...new Set(fd.getAll('who').map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const had = (await q('SELECT user_id FROM pc2_fuel_access WHERE asset_id = $1', [id])).map((r) => r.user_id);
  await q('DELETE FROM pc2_fuel_access WHERE asset_id = $1', [id]);
  for (const uid of want) await q('INSERT INTO pc2_fuel_access (asset_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, uid]);
  if (want.length) {
    await q(`UPDATE pc2_users SET perms = CASE WHEN perms IS NULL OR perms = '' THEN 'fuel_use' WHEN position('fuel_use' in perms) > 0 THEN perms ELSE perms || ',fuel_use' END WHERE id = ANY($1::int[])`, [want]);
  }
  const gone = had.filter((x) => !want.includes(x));
  if (gone.length) {
    await q(
      `UPDATE pc2_users SET perms = COALESCE(NULLIF(array_to_string(array_remove(string_to_array(COALESCE(perms, ''), ','), 'fuel_use'), ','), ''), '') WHERE id = ANY($1::int[]) AND role NOT IN ('om', 'sso') AND NOT EXISTS (SELECT 1 FROM pc2_fuel_access f WHERE f.user_id = pc2_users.id)`,
      [gone]
    );
  }
  await logEvent(u, 'edit', 'fuel', id, 'Fuel card ' + (name || a.name) + ': low level ' + pkr(low), null, null);
  back('/fuel/setup', (name || a.name) + ' saved', true);
}

export async function addFuelAsset(fd) {
  const u = await needOm();
  const name = s(fd, 'name').slice(0, 60);
  const low = s(fd, 'low_at') ? Number(s(fd, 'low_at')) : 0;
  if (!name) back('/fuel/setup', 'Enter the name');
  if (!(low >= 0)) back('/fuel/setup', 'Enter the low level in rupees');
  const dup = await q('SELECT id FROM pc2_fuel_assets WHERE lower(name) = lower($1)', [name]);
  if (dup.length) back('/fuel/setup', name + ' already exists');
  const sort = Number((await q('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM pc2_fuel_assets'))[0].n);
  await q("INSERT INTO pc2_fuel_assets (name, kind, low_at, sort) VALUES ($1, 'vehicle', $2, $3)", [name, low, sort]);
  await logEvent(u, 'create', 'fuel', null, 'Fuel card added: ' + name, null, null);
  back('/fuel/setup', name + ' added', true);
}