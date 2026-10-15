-- Keep R2 object keys and image metadata with the owning records; binaries stay in R2.
PRAGMA foreign_keys = ON;

ALTER TABLE shops ADD COLUMN logo_r2_key TEXT;
ALTER TABLE shops ADD COLUMN cover_r2_key TEXT;
ALTER TABLE shops ADD COLUMN logo_file_size INTEGER;
ALTER TABLE shops ADD COLUMN logo_mime_type TEXT;
ALTER TABLE shops ADD COLUMN cover_file_size INTEGER;
ALTER TABLE shops ADD COLUMN cover_mime_type TEXT;

ALTER TABLE shop_settings ADD COLUMN r2_key TEXT;
ALTER TABLE shop_settings ADD COLUMN file_size INTEGER;
ALTER TABLE shop_settings ADD COLUMN mime_type TEXT;

ALTER TABLE services ADD COLUMN r2_key TEXT;
ALTER TABLE services ADD COLUMN file_size INTEGER;
ALTER TABLE services ADD COLUMN mime_type TEXT;

ALTER TABLE barbers ADD COLUMN r2_key TEXT;
ALTER TABLE barbers ADD COLUMN avatar_file_size INTEGER;
ALTER TABLE barbers ADD COLUMN avatar_mime_type TEXT;

ALTER TABLE users ADD COLUMN avatar_r2_key TEXT;
ALTER TABLE users ADD COLUMN avatar_file_size INTEGER;
ALTER TABLE users ADD COLUMN avatar_mime_type TEXT;

ALTER TABLE gallery ADD COLUMN file_size INTEGER;
ALTER TABLE gallery ADD COLUMN mime_type TEXT;

CREATE UNIQUE INDEX shops_logo_r2_key_unique ON shops(logo_r2_key) WHERE logo_r2_key IS NOT NULL;
CREATE UNIQUE INDEX shops_cover_r2_key_unique ON shops(cover_r2_key) WHERE cover_r2_key IS NOT NULL;
CREATE UNIQUE INDEX shop_settings_r2_key_unique ON shop_settings(r2_key) WHERE r2_key IS NOT NULL;
CREATE UNIQUE INDEX services_r2_key_unique ON services(r2_key) WHERE r2_key IS NOT NULL;
CREATE UNIQUE INDEX barbers_r2_key_unique ON barbers(r2_key) WHERE r2_key IS NOT NULL;
CREATE UNIQUE INDEX users_avatar_r2_key_unique ON users(avatar_r2_key) WHERE avatar_r2_key IS NOT NULL;
CREATE UNIQUE INDEX gallery_r2_key_unique ON gallery(r2_key) WHERE r2_key IS NOT NULL;
