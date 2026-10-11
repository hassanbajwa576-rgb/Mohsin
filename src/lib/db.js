import 'server-only';
import { neon } from '@neondatabase/serverless';

const FUND_CHECK = `CHECK (fund IN ('petty','brc','other'))`;
const DDL = [
  `CREATE TABLE IF NOT EXISTS pc2_offices (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pc2_users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('om','sso','so')), office_id INTEGER NOT NULL REFERENCES pc2_offices(id), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_advances (id SERIAL PRIMARY KEY, fund TEXT NOT NULL ${FUND_CHECK}, amount INTEGER NOT NULL CHECK (amount > 0), received_on DATE NOT NULL, reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES pc2_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_expenses (id SERIAL PRIMARY KEY, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), fund TEXT NOT NULL ${FUND_CHECK}, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL CHECK (amount > 0), spent_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'submitted', submitted_by INTEGER NOT NULL REFERENCES pc2_users(id), decided_by INTEGER REFERENCES pc2_users(id), decided_at TIMESTAMPTZ, decision_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `INSERT INTO pc2_offices (code, name) VALUES ('LHR','Lahore'), ('ISB','Islamabad') ON CONFLICT (code) DO NOTHING`,
  // Cash issued by the SSO to a Support Officer, who spends it and submits an adjustment.
  `CREATE TABLE IF NOT EXISTS pc2_issues (id SERIAL PRIMARY KEY, fund TEXT NOT NULL ${FUND_CHECK}, amount INTEGER NOT NULL CHECK (amount > 0), returned INTEGER NOT NULL DEFAULT 0, issued_to INTEGER NOT NULL REFERENCES pc2_users(id), issued_by INTEGER NOT NULL REFERENCES pc2_users(id), issued_on DATE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  // A batch of reviewed expenses the OM submits back to Accounts.
  `CREATE TABLE IF NOT EXISTS pc2_batches (id SERIAL PRIMARY KEY, created_by INTEGER NOT NULL REFERENCES pc2_users(id), note TEXT NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0, item_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_notifications (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES pc2_users(id) ON DELETE CASCADE, message TEXT NOT NULL, link TEXT NOT NULL DEFAULT '/', is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS issue_id INTEGER REFERENCES pc2_issues(id)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES pc2_batches(id)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES pc2_users(id)`,
  `ALTER TABLE pc2_expenses ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
  `ALTER TABLE pc2_expenses DROP CONSTRAINT IF EXISTS pc2_expenses_status_check`,
  `UPDATE pc2_expenses SET status = 'submitted' WHERE status = 'pending'`,
  `ALTER TABLE pc2_expenses ALTER COLUMN status SET DEFAULT 'submitted'`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pc2_expenses_status_v2') THEN ALTER TABLE pc2_expenses ADD CONSTRAINT pc2_expenses_status_v2 CHECK (status IN ('submitted','verified','approved','sent','rejected')); END IF; END $$`,
];

let sql;
let ready;

async function init() {
  const c = neon(process.env.DATABASE_URL);
  for (const stmt of DDL) await c.query(stmt);
  sql = c;
}

export async function q(text, params = []) {
  if (!ready) ready = init().catch((e) => { ready = null; throw e; });
  await ready;
  return sql.query(text, params);
}
