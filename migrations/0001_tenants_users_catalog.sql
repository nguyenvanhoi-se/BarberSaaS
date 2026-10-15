-- Core tenant, identity, catalog, and shop configuration tables.
PRAGMA foreign_keys = ON;

CREATE TABLE shops (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(slug) BETWEEN 1 AND 63 AND slug NOT GLOB '*[^a-z0-9-]*'),
  domain TEXT COLLATE NOCASE UNIQUE
    CHECK (domain IS NULL OR (length(domain) <= 253 AND instr(domain, '/') = 0 AND instr(domain, ':') = 0)),
  logo_url TEXT,
  cover_url TEXT,
  phone TEXT,
  email TEXT COLLATE NOCASE,
  address TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  plan TEXT NOT NULL DEFAULT 'BASIC' CHECK (plan IN ('BASIC', 'PRO', 'PREMIUM')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  email TEXT NOT NULL COLLATE NOCASE CHECK (instr(email, '@') > 1),
  phone TEXT,
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'SHOP_OWNER', 'BARBER', 'CUSTOMER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((role = 'SUPER_ADMIN' AND shop_id IS NULL) OR (role <> 'SUPER_ADMIN' AND shop_id IS NOT NULL)),
  UNIQUE (id, shop_id),
  UNIQUE (shop_id, email)
);

CREATE TABLE services (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, shop_id)
);

CREATE TABLE barbers (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  avatar_url TEXT,
  phone TEXT,
  email TEXT COLLATE NOCASE,
  bio TEXT,
  experience_years INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  specialties TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(specialties)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, shop_id),
  UNIQUE (shop_id, email)
);

CREATE TABLE barber_working_hours (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  barber_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT,
  end_time TEXT,
  is_day_off INTEGER NOT NULL DEFAULT 0 CHECK (is_day_off IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (is_day_off = 1 AND start_time IS NULL AND end_time IS NULL)
    OR (
      is_day_off = 0
      AND start_time GLOB '[0-2][0-9]:[0-5][0-9]'
      AND end_time GLOB '[0-2][0-9]:[0-5][0-9]'
      AND substr(start_time, 1, 2) BETWEEN '00' AND '23'
      AND substr(end_time, 1, 2) BETWEEN '00' AND '23'
      AND start_time < end_time
    )
  ),
  UNIQUE (barber_id, day_of_week),
  FOREIGN KEY (barber_id, shop_id) REFERENCES barbers(id, shop_id) ON DELETE CASCADE
);

CREATE TABLE shop_settings (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (length(trim(key)) > 0),
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (shop_id, key)
);

CREATE UNIQUE INDEX users_super_admin_email_unique
  ON users(email COLLATE NOCASE)
  WHERE shop_id IS NULL;
CREATE INDEX users_email_idx ON users(email COLLATE NOCASE);
CREATE INDEX users_shop_id_idx ON users(shop_id);
CREATE INDEX services_shop_id_status_idx ON services(shop_id, status);
CREATE INDEX barbers_shop_id_status_idx ON barbers(shop_id, status);
CREATE INDEX barber_working_hours_shop_barber_day_idx
  ON barber_working_hours(shop_id, barber_id, day_of_week);
CREATE INDEX shop_settings_shop_id_idx ON shop_settings(shop_id);
