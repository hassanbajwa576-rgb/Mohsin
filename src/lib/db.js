import 'server-only';
import { neon } from '@neondatabase/serverless';

const FUND_CHECK = `CHECK (fund IN ('petty','brc','other'))`;
const DDL = [
  `CREATE TABLE IF NOT EXISTS pc2_offices (id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pc2_users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('om','sso','so')), office_id INTEGER NOT NULL REFERENCES pc2_offices(id), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_advances (id SERIAL PRIMARY KEY, fund TEXT NOT NULL ${FUND_CHECK}, amount INTEGER NOT NULL CHECK (amount > 0), received_on DATE NOT NULL, reference TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_by INTEGER REFERENCES pc2_users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS pc2_expenses (id SERIAL PRIMARY KEY, office_id INTEGER NOT NULL REFERENCES pc2_offices(id), fund TEXT NOT NULL ${FUND_CHECK}, category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount INTEGER NOT NULL CHECK (amount > 0), spent_on DATE NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')), submitted_by INTEGER NOT NULL REFERENCES pc2_users(id), decided_by INTEGER REFERENCES pc2_users(id), decided_at TIMESTAMPTZ, decision_note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `INSERT INTO pc2_offices (code, name) VALUES ('LHR','Lahore'), ('ISB','Islamabad') ON CONFLICT (code) DO NOTHING`,
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
