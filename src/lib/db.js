import 'server-only';
import { neon } from '@neondatabase/serverless';

const FUND_CHECK = `CHECK (fund IN ('petty','brc','other'))`;
const DDL = [
  `CREATE TABLE IF NOT EXISTS pc2_offices (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pc2_users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('om','sso','so')), office_id INTEGER NOT NULL REFERENCES pc2_offices(id), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_advances (id SERIAL PRIMARY KEY, fund TEXT NOT NULL ${FUND_CHECK}, amount INTEGER NOT NULL CHECK (amount > 0), received_on DATE NOT NULL, reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES pc2_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_expenses (id SERIAL PRIMARY KEY, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), fund TEXT NOT NULL ${FUND_CHECK}, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL CHECK (amount > 0), spent_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'submitted', submitted_by INTEGER NOT NULL REFERENCES pc2_users(id), decided_by INTEGER REFERENCES pc2_users(id), decided_at TIMESTAMPTZ, decision_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `INSERT INTO pc2_offices (code, name) VALUES ('LHR','Lahore'), ('ISB','Islamabad') ON CONFLICT (code) DO NOTHING`,
  // Cash issued by the Sr. SO to a Support Officer, who spends it and submits an adjustment.
  `CREATE TABLE IF NOT EXISTS pc2_issues (id SERIAL PRIMARY KEY, fund TEXT NOT NULL ${FUND_CHECK}, amount INTEGER NOT NULL CHECK (amount > 0), returned INTEGER NOT NULL DEFAULT 0, issued_to INTEGER NOT NULL REFERENCES pc2_users(id), issued_by INTEGER NOT NULL REFERENCES pc2_users(id), issued_on DATE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // A batch of reviewed expenses the SOM submits back to Accounts.
  `CREATE TABLE IF NOT EXISTS pc2_batches (id SERIAL PRIMARY KEY, created_by INTEGER NOT NULL REFERENCES pc2_users(id), note TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, item_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_notifications (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES pc2_users(id) ON DELETE CASCADE, message TEXT NOT NULL, link TEXT NOT NULL DEFAULT '/', is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // Audit trail of every change made in the app.
  `CREATE TABLE IF NOT EXISTS pc2_audit (id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), actor_id INTEGER, actor_name TEXT NOT NULL DEFAULT '', actor_role TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, entity TEXT NOT NULL, entity_id INTEGER, summary TEXT NOT NULL DEFAULT '', before JSONB, after JSONB)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS issue_id INTEGER REFERENCES pc2_issues(id)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES pc2_batches(id)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES pc2_users(id)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
  `ALTER TABLE pc2_expenses DROP CONSTRAINT IF EXISTS pc2_expenses_status_check`,
  `UPDATE pc2_expenses SET status = 'submitted' WHERE status = 'pending'`,
  `ALTER TABLE pc2_expenses ALTER COLUMN status SET DEFAULT 'submitted'`,
  `ALTER TABLE pc2_expenses DROP CONSTRAINT IF EXISTS pc2_expenses_status_v2`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pc2_expenses_status_v3') THEN ALTER TABLE pc2_expenses ADD CONSTRAINT pc2_expenses_status_v3 CHECK (status IN ('draft','submitted','verified','approved','sent','rejected')); END IF; END $$`,
  // Every expense now waits for the Sr. Ops Manager review (no Sr. SO verification step).
  `UPDATE pc2_expenses SET status = 'submitted' WHERE status = 'verified'`,
  // OpsTrack (attendance): employees, check in / out and break entries, plus guard logins.
  `CREATE TABLE IF NOT EXISTS pc2_staff (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, dept TEXT NOT NULL DEFAULT '', office_id INTEGER NOT NULL REFERENCES pc2_offices(id), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_attendance (id SERIAL PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES pc2_staff(id), office_id INTEGER NOT NULL REFERENCES pc2_offices(id), kind TEXT NOT NULL CHECK (kind IN ('in','out','break_out','break_in')), at TIMESTAMPTZ NOT NULL, entered_by INTEGER REFERENCES pc2_users(id), entered_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_attendance_staff_at ON pc2_attendance (staff_id, at)`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS shift TEXT NOT NULL DEFAULT ''`,
  // Extra access granted to one person by the Sr. Ops Manager (comma separated keys).
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS perms TEXT NOT NULL DEFAULT ''`,
  // Authenticator app (TOTP): secret, state, device-trust epoch, recovery code hashes, lockout.
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_secret TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_required BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_epoch INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_recovery TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_fails INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS totp_locked_until TIMESTAMPTZ`,
  // Username login (om1, sso1, so1, gmor, gevn).
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS username TEXT`,
  `UPDATE pc2_users u SET username = x.un FROM (SELECT id, (CASE WHEN role = 'guard' AND shift = 'morning' THEN 'gmor' WHEN role = 'guard' AND shift = 'evening' THEN 'gevn' WHEN role = 'guard' THEN 'guard' ELSE role END) || (CASE WHEN role = 'guard' AND shift IN ('morning', 'evening') AND rn = 1 THEN '' ELSE rn::text END) AS un FROM (SELECT id, role, shift, row_number() OVER (PARTITION BY role, COALESCE(shift, '') ORDER BY id) AS rn FROM pc2_users WHERE username IS NULL) t) x WHERE u.id = x.id AND u.username IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pc2_users_username_key ON pc2_users (lower(username))`,
  // Cash handed back to Accounts (by the Sr. OM from the pool or the Sr. SO from the cash they hold).
  `CREATE TABLE IF NOT EXISTS pc2_returns (id SERIAL PRIMARY KEY, fund TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0), returned_on DATE NOT NULL, reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', returned_by INTEGER REFERENCES pc2_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `ALTER TABLE pc2_users DROP CONSTRAINT IF EXISTS pc2_users_role_check`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pc2_users_role_v2') THEN ALTER TABLE pc2_users ADD CONSTRAINT pc2_users_role_v2 CHECK (role IN ('om','sso','so','guard')); END IF; END $$`,
  // Employee shifts (morning / evening / night) with editable times; Ops is now called Operations.
  `ALTER TABLE pc2_staff ADD COLUMN IF NOT EXISTS shift TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_staff ADD COLUMN IF NOT EXISTS shift_start TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_staff ADD COLUMN IF NOT EXISTS shift_end TEXT NOT NULL DEFAULT ''`,
  `UPDATE pc2_staff SET dept = 'Operations' WHERE lower(trim(dept)) = 'ops'`,
  // An expense paid from more than one advance is saved as linked parts (part 1 of 2, part 2 of 2).
  `ALTER TABLE pc2_attendance ADD COLUMN IF NOT EXISTS source TEXT`,
  `CREATE TABLE IF NOT EXISTS pc2_import_review (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, staff_id INTEGER, name TEXT NOT NULL DEFAULT '', day TEXT, item JSONB, app_text TEXT, excel_text TEXT, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by INTEGER, resolved_at TIMESTAMPTZ, resolved_by INTEGER, resolution TEXT)`,
  `CREATE INDEX IF NOT EXISTS pc2_import_review_open ON pc2_import_review (resolved_at)`,
  `CREATE TABLE IF NOT EXISTS pc2_visitors (id SERIAL PRIMARY KEY, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', vtype TEXT NOT NULL, host TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT '', badge TEXT NOT NULL DEFAULT '', in_at TIMESTAMPTZ NOT NULL, out_at TIMESTAMPTZ, entered_by INTEGER, out_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_visitors_in ON pc2_visitors (in_at)`,
  `ALTER TABLE pc2_visitors ADD COLUMN IF NOT EXISTS del_req_by INTEGER`,
  `ALTER TABLE pc2_visitors ADD COLUMN IF NOT EXISTS del_req_at TIMESTAMPTZ`,
  `ALTER TABLE pc2_visitors ADD COLUMN IF NOT EXISTS del_reason TEXT`,
  `CREATE TABLE IF NOT EXISTS pc2_expected (id SERIAL PRIMARY KEY, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', vtype TEXT NOT NULL, host TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL DEFAULT '', due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', visitor_id INTEGER, created_by INTEGER, marked_by INTEGER, marked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_expected_due ON pc2_expected (due_at)`,
  `CREATE TABLE IF NOT EXISTS pc2_complaints (id SERIAL PRIMARY KEY, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', location TEXT NOT NULL DEFAULT '', complainant_type TEXT NOT NULL DEFAULT 'staff', complainant_name TEXT NOT NULL DEFAULT '', complainant_phone TEXT NOT NULL DEFAULT '', due_on DATE NOT NULL, resolution TEXT NOT NULL DEFAULT '', raised_by INTEGER, assigned_to INTEGER, resolved_by INTEGER, resolved_at TIMESTAMPTZ, reminded_on DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_complaints_status ON pc2_complaints (status, due_on)`,
  `ALTER TABLE pc2_complaints ADD COLUMN IF NOT EXISTS resp_hk_id INTEGER`,
  `ALTER TABLE pc2_complaints ADD COLUMN IF NOT EXISTS resp_user_id INTEGER`,
  `ALTER TABLE pc2_complaints ADD COLUMN IF NOT EXISTS resp_note TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS pc2_complaint_files (id SERIAL PRIMARY KEY, complaint_id INTEGER NOT NULL REFERENCES pc2_complaints(id) ON DELETE CASCADE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, data BYTEA NOT NULL, uploaded_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_complaint_files_c ON pc2_complaint_files (complaint_id)`,
  `CREATE TABLE IF NOT EXISTS pc2_complaint_notes (id SERIAL PRIMARY KEY, complaint_id INTEGER NOT NULL REFERENCES pc2_complaints(id) ON DELETE CASCADE, user_id INTEGER, note TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'note', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_complaint_notes_c ON pc2_complaint_notes (complaint_id)`,
  `CREATE TABLE IF NOT EXISTS pc2_fuel_refill (id SERIAL PRIMARY KEY, asset_id INTEGER NOT NULL REFERENCES pc2_fuel_assets(id) ON DELETE CASCADE, requested_by INTEGER NOT NULL, requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), status TEXT NOT NULL DEFAULT 'open', closed_by INTEGER, closed_at TIMESTAMPTZ)`,
  `ALTER TABLE pc2_visitors ADD COLUMN IF NOT EXISTS remarks TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_expected ADD COLUMN IF NOT EXISTS remarks TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_expected ADD COLUMN IF NOT EXISTS rem15_at TIMESTAMPTZ`,
  `ALTER TABLE pc2_expected ADD COLUMN IF NOT EXISTS rem5_at TIMESTAMPTZ`,
  `ALTER TABLE pc2_expected ADD COLUMN IF NOT EXISTS late_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS pc2_hk_people (id SERIAL PRIMARY KEY, name TEXT NOT NULL, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), role TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE, created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_hk_off (id SERIAL PRIMARY KEY, hk_id INTEGER NOT NULL REFERENCES pc2_hk_people(id) ON DELETE CASCADE, from_date DATE NOT NULL, to_date DATE NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_hk_off_dates ON pc2_hk_off (from_date, to_date)`,
  `ALTER TABLE pc2_hk_off ADD COLUMN IF NOT EXISTS hours NUMERIC(5,2)`,
  `ALTER TABLE pc2_hk_people ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_hk_people ADD COLUMN IF NOT EXISTS joined_on DATE`,
  `ALTER TABLE pc2_hk_people ADD COLUMN IF NOT EXISTS birthday DATE`,
  `ALTER TABLE pc2_hk_off ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'`,
  `ALTER TABLE pc2_hk_off ADD COLUMN IF NOT EXISTS requested_by INTEGER`,
  `ALTER TABLE pc2_hk_off ADD COLUMN IF NOT EXISTS decided_by INTEGER`,
  `ALTER TABLE pc2_hk_off ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS pc2_hk_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pc2_holidays (day DATE PRIMARY KEY, name TEXT NOT NULL, created_by INTEGER)`,
  `CREATE TABLE IF NOT EXISTS pc2_hk_opd (id SERIAL PRIMARY KEY, hk_id INTEGER NOT NULL REFERENCES pc2_hk_people(id) ON DELETE CASCADE, claim_date DATE NOT NULL, amount NUMERIC(12,2) NOT NULL, note TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_hk_opd_date ON pc2_hk_opd (claim_date)`,
  `CREATE TABLE IF NOT EXISTS pc2_push_subs (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_push_keys (id INTEGER PRIMARY KEY, pub TEXT NOT NULL, priv TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pc2_fuel_assets (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'vehicle', low_at NUMERIC(12,2) NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE, sort INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS pc2_fuel_txn (id SERIAL PRIMARY KEY, asset_id INTEGER NOT NULL REFERENCES pc2_fuel_assets(id), kind TEXT NOT NULL CHECK (kind IN ('fill','topup','opening')), amount NUMERIC(12,2) NOT NULL, litres NUMERIC(10,2), reading NUMERIC(12,1), at TIMESTAMPTZ NOT NULL, note TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_fuel_txn_at ON pc2_fuel_txn (at)`,
  `CREATE TABLE IF NOT EXISTS pc2_fuel_access (asset_id INTEGER NOT NULL REFERENCES pc2_fuel_assets(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, PRIMARY KEY (asset_id, user_id))`,
  `INSERT INTO pc2_fuel_access (asset_id, user_id) SELECT a.id, u.id FROM pc2_fuel_assets a, pc2_users u WHERE a.name = 'United Bike' AND u.name = 'Muhammad Zubair' ON CONFLICT DO NOTHING`,
  `UPDATE pc2_users SET perms = CASE WHEN perms IS NULL OR perms = '' THEN 'fuel_use' WHEN position('fuel_use' in perms) > 0 THEN perms ELSE perms || ',fuel_use' END WHERE name = 'Muhammad Zubair'`,
  `INSERT INTO pc2_fuel_assets (name, kind, low_at, sort) VALUES ('Office Genset', 'genset', 40000, 1), ('BOLDBus', 'bus', 50000, 2), ('BRV', 'vehicle', 25000, 3), ('United Bike', 'bike', 10000, 4) ON CONFLICT (name) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS pc2_review_marks (id SERIAL PRIMARY KEY, staff_id INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, sig TEXT NOT NULL, marked_by INTEGER, marked_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pc2_review_marks_key ON pc2_review_marks (staff_id, day, kind, sig)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS split_group TEXT`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS split_part INTEGER`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS split_total INTEGER`,
  // A shift set for a whole department; employees without their own shift follow it.
  // Temporary hours for a date range (one row per department, employee or everyone); they end by themselves.
  `CREATE TABLE IF NOT EXISTS pc2_shift_periods (id SERIAL PRIMARY KEY, scope TEXT NOT NULL CHECK (scope IN ('everyone','department','employee')), dept TEXT NOT NULL DEFAULT '', staff_id INTEGER REFERENCES pc2_staff(id) ON DELETE CASCADE, shift_start TEXT NOT NULL, shift_end TEXT NOT NULL, from_date DATE NOT NULL, to_date DATE NOT NULL, note TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES pc2_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_dept_shifts (dept TEXT PRIMARY KEY, shift TEXT NOT NULL, shift_start TEXT NOT NULL, shift_end TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // A tag and a remark the Sr. Ops Manager can put on a visitor record (for example when HR did not announce the visit in the WhatsApp group).
  `ALTER TABLE pc2_visitors ADD COLUMN IF NOT EXISTS om_tag TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE pc2_visitors ADD COLUMN IF NOT EXISTS om_note TEXT NOT NULL DEFAULT ''`,
  // ExpRev: the expenditure list, plus the dashboard, budget and profit-and-loss layouts read from the Ops Expenses Dashboard workbook.
  `CREATE TABLE IF NOT EXISTS pc2_er_entries (id SERIAL PRIMARY KEY, spent_on DATE NOT NULL, cost_center TEXT NOT NULL DEFAULT '', expense_type TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', amount NUMERIC(14,2) NOT NULL, pay_mode TEXT NOT NULL DEFAULT '', office TEXT NOT NULL DEFAULT '', vendor TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS pc2_er_entries_on ON pc2_er_entries (spent_on)`,
  // Advance types: the list is data now (the Sr. Ops Manager adds more); the old fixed list of three is dropped from the tables.
  `ALTER TABLE pc2_users ADD COLUMN IF NOT EXISTS pages TEXT NOT NULL DEFAULT ''`,
  `CREATE TABLE IF NOT EXISTS pc2_fund_types (key TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `INSERT INTO pc2_fund_types (key, label, sort) VALUES ('petty','Petty Cash',1),('brc','BRC',2),('other','Others',3) ON CONFLICT (key) DO NOTHING`,
  `DO $$ DECLARE r record; BEGIN FOR r IN SELECT conrelid::regclass AS t, conname FROM pg_constraint WHERE contype = 'c' AND conrelid::regclass::text LIKE 'pc2\_%' AND pg_get_constraintdef(oid) LIKE '%fund%' AND pg_get_constraintdef(oid) LIKE '%petty%' LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname); END LOOP; END $$`,
  `CREATE TABLE IF NOT EXISTS pc2_er_sheet (id SERIAL PRIMARY KEY, kind TEXT NOT NULL, sort INTEGER NOT NULL, label TEXT NOT NULL, row_kind TEXT NOT NULL DEFAULT 'line', field TEXT NOT NULL DEFAULT '', mval TEXT NOT NULL DEFAULT '', meta JSONB NOT NULL DEFAULT '{}'::jsonb, vals JSONB NOT NULL DEFAULT '{}'::jsonb)`,
  // One-time cleanup: older "updated your profile: pages: ..." notifications dumped the full raw list of page paths.
  // Replace just that segment with a short summary; newer notifications (which never contain a "/") are left alone.
  `UPDATE pc2_notifications SET message = regexp_replace(message, 'pages: [^;]*/[^;]*', 'pages: updated', 'g') WHERE message ~ 'pages: [^;]*/'`,
  // A no-show can be rescheduled: the new expected entry points back at the one it replaces, so the whole
  // history (scheduled -> no show -> rescheduled -> arrived or no show again...) can be read back as a chain.
  `ALTER TABLE pc2_expected ADD COLUMN IF NOT EXISTS reschedule_of INTEGER REFERENCES pc2_expected(id)`,
];

let sql;
let ready;

// Bump this whenever DDL changes. The statements above only run when the stored version differs,
// so a cold start costs one query instead of a couple of dozen.
const SCHEMA_VERSION = '2026-10-30-3';

async function init() {
  const c = neon(process.env.DATABASE_URL);
  let current = null;
  try {
    const r = await c.query(`SELECT value FROM pc2_meta WHERE key = 'schema'`);
    current = r[0] ? r[0].value : null;
  } catch {
    current = null;
  }
  if (current !== SCHEMA_VERSION) {
    for (const stmt of DDL) await c.query(stmt);
    await c.query(`CREATE TABLE IF NOT EXISTS pc2_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    await c.query(`INSERT INTO pc2_meta (key, value) VALUES ('schema', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [SCHEMA_VERSION]);
  }
  sql = c;
}

export async function q(text, params = []) {
  if (!ready) ready = init().catch((e) => { ready = null; throw e; });
  await ready;
  return sql.query(text, params);
}
