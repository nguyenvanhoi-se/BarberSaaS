import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerCli = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const seedFile = resolve(projectRoot, ".wrangler/local-seed.sql");
const passwordIterations = 600_000;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before running the local seed command.`);
  }
  return value;
}

function passwordHash(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, passwordIterations, 32, "sha256");
  return `pbkdf2-sha256$${passwordIterations}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function sql(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatement(table, columns, values, conflictClause = "OR IGNORE", suffix = "") {
  const serializedValues = values.map(sql).join(", ");
  return `INSERT ${conflictClause} INTO ${table} (${columns.join(", ")}) VALUES (${serializedValues})${suffix};`;
}

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wranglerCli, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: resolve(projectRoot, ".wrangler/config"),
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Wrangler command failed with exit code ${result.status ?? 1}.`);
  }
}

function main() {
  const adminEmail = requiredEnvironment("SUPER_ADMIN_EMAIL").toLowerCase();
  const adminPassword = requiredEnvironment("SUPER_ADMIN_PASSWORD");
  const demoPassword = requiredEnvironment("LOCAL_DEMO_PASSWORD");

  if (adminPassword.length < 12 || demoPassword.length < 12) {
    throw new Error("SUPER_ADMIN_PASSWORD and LOCAL_DEMO_PASSWORD must be at least 12 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("SUPER_ADMIN_EMAIL must be a valid email address.");
  }

  const adminId = "d0000000-0000-4000-8000-000000000001";
  const shopA = "d0000000-0000-4000-8000-000000000010";
  const shopB = "d0000000-0000-4000-8000-000000000011";
  const ownerA = "d0000000-0000-4000-8000-000000000020";
  const ownerB = "d0000000-0000-4000-8000-000000000021";
  const demoPasswordHash = passwordHash(demoPassword);
  const statements = [];

  statements.push(
    insertStatement(
      "shops",
      ["id", "name", "slug", "domain", "phone", "email", "address", "status", "plan"],
      [shopA, "Demo Barber Studio", "demo-barber-studio", null, "+84900000001", "studio@example.test", "Ho Chi Minh City", "ACTIVE", "PRO"],
    ),
    insertStatement(
      "shops",
      ["id", "name", "slug", "domain", "phone", "email", "address", "status", "plan"],
      [shopB, "Demo Classic Barber", "demo-classic-barber", null, "+84900000002", "classic@example.test", "Da Nang", "ACTIVE", "BASIC"],
    ),
    insertStatement(
      "users",
      ["id", "shop_id", "name", "email", "password_hash", "role", "status"],
      [adminId, null, "Local Super Admin", adminEmail, passwordHash(adminPassword), "SUPER_ADMIN", "ACTIVE"],
      "",
      " ON CONFLICT(id) DO UPDATE SET email = excluded.email, password_hash = excluded.password_hash, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
    ),
    insertStatement(
      "users",
      ["id", "shop_id", "name", "email", "password_hash", "role", "status"],
      [ownerA, shopA, "Studio Owner", "owner.studio@example.test", demoPasswordHash, "SHOP_OWNER", "ACTIVE"],
    ),
    insertStatement(
      "users",
      ["id", "shop_id", "name", "email", "password_hash", "role", "status"],
      [ownerB, shopB, "Classic Owner", "owner.classic@example.test", demoPasswordHash, "SHOP_OWNER", "ACTIVE"],
    ),
  );

  const barbers = [
    { id: "d0000000-0000-4000-8000-000000000030", shop: shopA, name: "Minh Tran", email: "minh.tran@example.test" },
    { id: "d0000000-0000-4000-8000-000000000031", shop: shopA, name: "Quang Le", email: "quang.le@example.test" },
    { id: "d0000000-0000-4000-8000-000000000032", shop: shopB, name: "An Pham", email: "an.pham@example.test" },
    { id: "d0000000-0000-4000-8000-000000000033", shop: shopB, name: "Bao Nguyen", email: "bao.nguyen@example.test" },
  ];
  for (const barber of barbers) {
    statements.push(
      insertStatement(
        "barbers",
        ["id", "shop_id", "name", "email", "bio", "experience_years", "specialties", "status"],
        [barber.id, barber.shop, barber.name, barber.email, "Local demo barber profile", 5, JSON.stringify(["Classic cut", "Fade"]), "ACTIVE"],
      ),
    );
    const barberUserId = barber.id.replace(/30$/, "60").replace(/31$/, "61").replace(/32$/, "62").replace(/33$/, "63");
    statements.push(
      insertStatement("users", ["id", "shop_id", "name", "email", "password_hash", "role", "status"], [barberUserId, barber.shop, barber.name, barber.email, demoPasswordHash, "BARBER", "ACTIVE"]),
      insertStatement("barber_user_links", ["shop_id", "user_id", "barber_id"], [barber.shop, barberUserId, barber.id]),
    );
    for (let day = 0; day <= 6; day += 1) {
      const dayOff = day === 0;
      statements.push(
        insertStatement(
          "barber_working_hours",
          ["id", "shop_id", "barber_id", "day_of_week", "start_time", "end_time", "is_day_off"],
          [randomUUID(), barber.shop, barber.id, day, dayOff ? null : "09:00", dayOff ? null : "18:00", dayOff ? 1 : 0],
        ),
      );
    }
  }

  const services = [
    { id: "d0000000-0000-4000-8000-000000000040", shop: shopA, name: "Classic Haircut", price: 180000, duration: 45 },
    { id: "d0000000-0000-4000-8000-000000000041", shop: shopA, name: "Skin Fade", price: 220000, duration: 60 },
    { id: "d0000000-0000-4000-8000-000000000042", shop: shopA, name: "Beard Trim", price: 100000, duration: 30 },
    { id: "d0000000-0000-4000-8000-000000000043", shop: shopB, name: "Traditional Cut", price: 150000, duration: 45 },
    { id: "d0000000-0000-4000-8000-000000000044", shop: shopB, name: "Hair and Beard", price: 250000, duration: 75 },
    { id: "d0000000-0000-4000-8000-000000000045", shop: shopB, name: "Hot Towel Shave", price: 180000, duration: 45 },
  ];
  for (const service of services) {
    statements.push(
      insertStatement(
        "services",
        ["id", "shop_id", "name", "price", "duration_minutes", "status"],
        [service.id, service.shop, service.name, service.price, service.duration, "ACTIVE"],
      ),
    );
  }

  const customers = [
    { id: "d0000000-0000-4000-8000-000000000050", shop: shopA, name: "Linh Dao", email: "linh.dao@example.test" },
    { id: "d0000000-0000-4000-8000-000000000051", shop: shopA, name: "Khoa Vo", email: "khoa.vo@example.test" },
    { id: "d0000000-0000-4000-8000-000000000052", shop: shopA, name: "Tuan Bui", email: "tuan.bui@example.test" },
    { id: "d0000000-0000-4000-8000-000000000053", shop: shopB, name: "Mai Ho", email: "mai.ho@example.test" },
    { id: "d0000000-0000-4000-8000-000000000054", shop: shopB, name: "Long Dang", email: "long.dang@example.test" },
  ];
  for (const customer of customers) {
    statements.push(
      insertStatement(
        "users",
        ["id", "shop_id", "name", "email", "password_hash", "role", "status"],
        [customer.id, customer.shop, customer.name, customer.email, demoPasswordHash, "CUSTOMER", "ACTIVE"],
      ),
    );
  }

  statements.push(
    insertStatement("bookings", ["id", "shop_id", "booking_code", "customer_id", "barber_id", "service_id", "booking_date", "start_time", "end_time", "total_price", "note", "status"], ["d0000000-0000-4000-8000-000000000060", shopA, "DEMO-A-0001", customers[0].id, barbers[0].id, services[0].id, "2026-10-05", "10:00", "10:45", services[0].price, "Local demo completed booking", "COMPLETED"]),
    insertStatement("bookings", ["id", "shop_id", "booking_code", "customer_id", "barber_id", "service_id", "booking_date", "start_time", "end_time", "total_price", "note", "status"], ["d0000000-0000-4000-8000-000000000061", shopB, "DEMO-B-0001", customers[3].id, barbers[2].id, services[3].id, "2026-10-08", "11:00", "11:45", services[3].price, "Local demo pending booking", "PENDING"]),
    insertStatement("reviews", ["id", "shop_id", "booking_id", "customer_id", "barber_id", "rating", "comment", "status"], ["d0000000-0000-4000-8000-000000000070", shopA, "d0000000-0000-4000-8000-000000000060", customers[0].id, barbers[0].id, 5, "Local demo review", "APPROVED"]),
    insertStatement("shop_settings", ["id", "shop_id", "key", "value"], ["d0000000-0000-4000-8000-000000000080", shopA, "business_name", "Demo Barber Studio"]),
    insertStatement("shop_settings", ["id", "shop_id", "key", "value"], ["d0000000-0000-4000-8000-000000000081", shopB, "business_name", "Demo Classic Barber"]),
    insertStatement("subscriptions", ["id", "shop_id", "plan", "status", "started_at"], ["d0000000-0000-4000-8000-000000000090", shopA, "PRO", "ACTIVE", "2026-10-01T00:00:00.000Z"]),
    insertStatement("subscriptions", ["id", "shop_id", "plan", "status", "started_at"], ["d0000000-0000-4000-8000-000000000091", shopB, "BASIC", "ACTIVE", "2026-10-01T00:00:00.000Z"]),
  );

  mkdirSync(dirname(seedFile), { recursive: true });
  writeFileSync(seedFile, `${statements.join("\n")}\n`, "utf8");

  try {
    runWrangler(["d1", "migrations", "apply", "barbersaas-db", "--local"]);
    runWrangler(["d1", "execute", "barbersaas-db", "--local", `--file=${seedFile}`]);
  } finally {
    rmSync(seedFile, { force: true });
  }

  console.log("Local development seed applied. Admin email:", adminEmail);
  console.log("Local demo login password: value supplied by LOCAL_DEMO_PASSWORD.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
