import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrations = readdirSync(resolve(root, "migrations"))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
  .sort();
const expectedTables = [
  "audit_logs", "barber_working_hours", "barbers", "bookings", "email_logs", "gallery",
  "invoices", "owner_invites", "payment_webhooks", "payments", "reviews", "services",
  "sessions", "shop_domains", "shop_settings", "shops", "subscriptions", "users",
];
const requiredIndexes = [
  "bookings_shop_barber_date_start_idx", "bookings_shop_barber_date_end_idx",
  "bookings_shop_date_status_idx", "email_logs_shop_created_idx", "email_logs_status_created_idx",
];

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");

try {
  assert.equal(migrations.length, 14, "Unexpected migration count; update this validation deliberately");
  // Apply a fresh migration chain through 0013, then seed one tenant before the notification migration.
  for (const name of migrations.slice(0, -1)) apply(name);
  db.prepare("INSERT INTO shops(id,name,slug) VALUES(?,?,?)").run("migration-fixture-shop", "Migration Fixture", "migration-fixture");
  const notificationMigration = migrations.at(-1);
  assert.ok(notificationMigration);
  apply(notificationMigration);

  const actualTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
  for (const table of expectedTables) assert.ok(actualTables.includes(table), `Missing required table ${table}`);

  const actualIndexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all().map((row) => row.name));
  for (const index of requiredIndexes) assert.ok(actualIndexes.has(index), `Missing required index ${index}`);

  const settings = db.prepare("SELECT key FROM shop_settings WHERE shop_id=? ORDER BY key").all("migration-fixture-shop").map((row) => row.key);
  assert.deepEqual(settings, ["booking_email_enabled", "owner_notification_enabled", "payment_email_enabled", "reminder_enabled"]);

  // The migration's seed statements must remain safe to retry independently of D1's migration ledger.
  const source = readFileSync(resolve(root, "migrations", notificationMigration), "utf8");
  const seedStatements = source.match(/INSERT INTO shop_settings\(id,shop_id,key,value\)\s*SELECT[\s\S]*?ON CONFLICT\(shop_id,key\) DO NOTHING;/gu) ?? [];
  assert.equal(seedStatements.length, 4, "Expected four idempotent notification setting seeds");
  for (const statement of seedStatements) db.exec(statement);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM shop_settings WHERE shop_id=?").get("migration-fixture-shop").count, 4);

  const insertEmail = db.prepare(`INSERT INTO email_logs(id,shop_id,user_id,recipient,recipient_hash,template,notification_key,status,provider)
    VALUES(?,NULL,NULL,'test@example.invalid','fixture-hash','welcome','migration-test-key','FAILED','none')`);
  insertEmail.run("email-fixture-first");
  assert.throws(() => insertEmail.run("email-fixture-duplicate"), /UNIQUE constraint failed/u, "email notification key must be unique");

  assert.ok(Number(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").get().count) >= 50);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  console.log(`PASS ${migrations.length} clean SQLite migrations; schema, indexes, FK, notification seed retry, and uniqueness validated`);
} catch (error) {
  const migrationMatch = error instanceof Error ? error.message.match(/Migration ([^ ]+) failed/u) : null;
  if (migrationMatch) console.error(`FAIL migration ${migrationMatch[1]}`);
  else console.error("FAIL migration/schema validation");
  console.error(error instanceof Error ? error.message : "Unknown migration validation error");
  process.exitCode = 1;
} finally {
  db.close();
}

function apply(name) {
  try {
    db.exec(readFileSync(resolve(root, "migrations", name), "utf8"));
  } catch (error) {
    throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : "Unknown SQL error"}`, { cause: error });
  }
}
