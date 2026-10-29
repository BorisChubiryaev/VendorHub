export const schemaSql = `
CREATE TABLE IF NOT EXISTS tribes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  unit TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  roles TEXT NOT NULL,            -- JSON: ["customer","pool_manager"]
  tribe_id INTEGER REFERENCES tribes(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  tribe_id INTEGER REFERENCES tribes(id)
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  inn TEXT,
  contact TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id),
  roles TEXT NOT NULL,            -- JSON: [{"role":"Backend-разработчик","rate":3500}]
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS limits (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('tribe','reserve')),
  tribe_id INTEGER REFERENCES tribes(id),
  amount REAL NOT NULL,
  remaining REAL NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  full_name TEXT NOT NULL DEFAULT '',
  age INTEGER,
  role TEXT,
  level TEXT,
  skills TEXT NOT NULL DEFAULT '[]',   -- JSON array
  rating REAL,
  available_from TEXT,
  available_to TEXT,
  total_experience REAL,               -- лет
  uvb_status TEXT NOT NULL DEFAULT 'not_checked',
  city TEXT,
  rate REAL,                           -- руб/час
  sber_experience TEXT,
  resume_experience TEXT,
  reviews TEXT NOT NULL DEFAULT '[]',  -- JSON: [{"author","text","score","date"}]
  vendor_id INTEGER REFERENCES vendors(id),
  resume_file TEXT,
  resume_text TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backlog_items (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS needs (
  id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','matching','in_hq','completed','cancelled')),
  initiator_id INTEGER NOT NULL REFERENCES users(id),
  tribe_id INTEGER REFERENCES tribes(id),
  product TEXT NOT NULL DEFAULT '',
  backlog_key TEXT,
  backlog_url TEXT,
  requirements_summary TEXT,
  scenario TEXT,                 -- best | fast | cheap | custom
  parent_need_id INTEGER REFERENCES needs(id),
  source TEXT NOT NULL DEFAULT 'web',   -- web | assistant | sberchat | split
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  hq_sent_at TEXT
);

-- Позиции потребности. В черновике позиция может иметь количество > 1;
-- при отправке на подбор раскладывается на позиции фактической потребности по 1 человеку.
CREATE TABLE IF NOT EXISTS need_positions (
  id INTEGER PRIMARY KEY,
  need_id INTEGER NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  level TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  skills TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  end_date TEXT,
  interview_required INTEGER NOT NULL DEFAULT 0,
  -- выбранный вариант обеспечения
  option_case INTEGER,           -- 1..7, см. services/matching.ts
  candidate_id INTEGER REFERENCES candidates(id),
  contract_id INTEGER REFERENCES contracts(id),
  limit_id INTEGER REFERENCES limits(id),
  relevance REAL,
  -- маршрут
  route_scenario TEXT,           -- А..Ж
  route_status TEXT NOT NULL DEFAULT 'not_started',
  route_steps TEXT,              -- JSON: [{"step","status"}]
  route_started_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY,
  system TEXT NOT NULL,          -- jira | sberchat | pulse | lk | limits | procurement | hq
  direction TEXT NOT NULL,       -- out | in
  entity TEXT,
  entity_id INTEGER,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assistant_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'web',
  state TEXT NOT NULL,           -- JSON
  messages TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_positions_need ON need_positions(need_id);
CREATE INDEX IF NOT EXISTS idx_needs_initiator ON needs(initiator_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
`;
