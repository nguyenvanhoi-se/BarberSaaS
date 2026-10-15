-- Scheduling, customer reviews, and R2-backed gallery metadata.
PRAGMA foreign_keys = ON;

CREATE TABLE bookings (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  barber_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  booking_date TEXT NOT NULL CHECK (booking_date GLOB '????-??-??'),
  start_time TEXT NOT NULL
    CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(start_time, 1, 2) BETWEEN '00' AND '23'),
  end_time TEXT NOT NULL
    CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(end_time, 1, 2) BETWEEN '00' AND '23'),
  total_price INTEGER NOT NULL CHECK (total_price >= 0),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_time < end_time),
  UNIQUE (shop_id, booking_code),
  UNIQUE (id, shop_id),
  FOREIGN KEY (customer_id, shop_id) REFERENCES users(id, shop_id) ON DELETE RESTRICT,
  FOREIGN KEY (barber_id, shop_id) REFERENCES barbers(id, shop_id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id, shop_id) REFERENCES services(id, shop_id) ON DELETE RESTRICT
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  barber_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'HIDDEN', 'REJECTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (shop_id, booking_id),
  FOREIGN KEY (booking_id, shop_id) REFERENCES bookings(id, shop_id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id, shop_id) REFERENCES users(id, shop_id) ON DELETE RESTRICT,
  FOREIGN KEY (barber_id, shop_id) REFERENCES barbers(id, shop_id) ON DELETE RESTRICT
);

CREATE TABLE gallery (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT,
  image_url TEXT NOT NULL,
  r2_key TEXT,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX bookings_shop_date_status_idx ON bookings(shop_id, booking_date, status);
CREATE INDEX bookings_shop_barber_date_start_idx ON bookings(shop_id, barber_id, booking_date, start_time);
CREATE INDEX bookings_shop_barber_date_end_idx ON bookings(shop_id, barber_id, booking_date, end_time);
CREATE INDEX bookings_shop_customer_date_idx ON bookings(shop_id, customer_id, booking_date);
CREATE INDEX bookings_shop_service_date_idx ON bookings(shop_id, service_id, booking_date);
CREATE INDEX reviews_shop_status_created_idx ON reviews(shop_id, status, created_at DESC);
CREATE INDEX reviews_shop_barber_idx ON reviews(shop_id, barber_id);
CREATE INDEX gallery_shop_sort_idx ON gallery(shop_id, sort_order, created_at DESC);
