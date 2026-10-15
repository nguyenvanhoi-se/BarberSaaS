import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withIsolatedLocalPersistence } from "./wrangler-test-utils.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const host = "127.0.0.1";
const port = 8791;
const base = `http://${host}:${port}`;
const password = "Phase4-Test-Password-123!";
const ids = { shopA: "phase4-shop-a", shopB: "phase4-shop-b", shopSuspended: "phase5-shop-suspended", shopInactive: "phase5-shop-inactive", ownerA: "phase4-owner-a", ownerB: "phase4-owner-b", barberUser: "phase4-barber-user-a", customerA: "phase4-customer-a", customerB: "phase4-customer-b", admin: "phase4-admin", serviceA: "phase4-service-a", serviceB: "phase4-service-b", barberA: "phase4-barber-a", barberB: "phase4-barber-b", bookingA: "phase4-booking-a", bookingB: "phase4-booking-b", galleryA: "phase5-gallery-a", galleryB: "phase5-gallery-b", reviewA: "phase5-review-a", reviewB: "phase5-review-b" };
const env = { ...process.env, XDG_CONFIG_HOME: resolve(root, ".wrangler/config") };
const localVars = resolve(root, ".dev.vars");
const hadLocalVars = existsSync(localVars);
const originalLocalVars = hadLocalVars ? readFileSync(localVars) : null;
let worker;
let fixturesApplied = false;

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...withIsolatedLocalPersistence(args, root, "phase4")], { cwd: root, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
}

function sql(value) { return value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }

function makePasswordHash(value) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(value, salt, 600_000, 32, "sha256");
  return `pbkdf2-sha256$600000$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function insert(table, columns, values) {
  return `INSERT INTO ${table} (${columns.join(",")}) VALUES (${values.map(sql).join(",")});`;
}

function writeFixtures() {
  const hash = makePasswordHash(password);
  const statements = [
    `DELETE FROM shops WHERE id IN (${sql(ids.shopA)},${sql(ids.shopB)},${sql(ids.shopSuspended)},${sql(ids.shopInactive)});`,
    `DELETE FROM users WHERE id IN (${sql(ids.admin)});`,
    insert("shops", ["id", "name", "slug", "domain", "status", "plan"], [ids.shopA, "Phase 4 Shop A", "phase4-a", "shop-a.test", "ACTIVE", "PRO"]),
    insert("shops", ["id", "name", "slug", "domain", "status", "plan"], [ids.shopB, "Phase 4 Shop B", "phase4-b", "phase4-a.platform.test", "ACTIVE", "BASIC"]),
    insert("shops", ["id", "name", "slug", "domain", "status"], [ids.shopSuspended, "Paused Demo Shop", "phase5-paused", "paused.test", "SUSPENDED"]),
    insert("shops", ["id", "name", "slug", "domain", "status"], [ids.shopInactive, "Inactive Demo Shop", "phase5-inactive", "inactive.test", "INACTIVE"]),
    ...[[ids.shopA,"shop-a.test"],[ids.shopB,"phase4-a.platform.test"],[ids.shopSuspended,"paused.test"],[ids.shopInactive,"inactive.test"]].map(([shopId,hostname])=>insert("shop_domains",["id","shop_id","hostname","type","status","verification_status","ssl_status"],[`domain-${shopId}`,shopId,hostname,"CUSTOM_DOMAIN","ACTIVE","ACTIVE","ACTIVE"])),
  ];
  for (const [id, shopId, name, email, role] of [
    [ids.ownerA, ids.shopA, "Owner A", "owner-a@phase4.test", "SHOP_OWNER"],
    [ids.ownerB, ids.shopB, "Owner B", "owner-b@phase4.test", "SHOP_OWNER"],
    [ids.barberUser, ids.shopA, "Barber A user", "barber-a@phase4.test", "BARBER"],
    [ids.customerA, ids.shopA, "Customer A", "customer-a@phase4.test", "CUSTOMER"],
    [ids.customerB, ids.shopB, "Customer B", "customer-b@phase4.test", "CUSTOMER"],
    [ids.admin, null, "Super Admin", "admin@phase4.test", "SUPER_ADMIN"],
  ]) statements.push(insert("users", ["id", "shop_id", "name", "email", "password_hash", "role", "status"], [id, shopId, name, email, hash, role, "ACTIVE"]));
  statements.push(
    insert("services", ["id", "shop_id", "name", "price", "duration_minutes"], [ids.serviceA, ids.shopA, "A Cut", 100, 30]),
    insert("services", ["id", "shop_id", "name", "price", "duration_minutes"], [ids.serviceB, ids.shopB, "B Cut", 200, 30]),
    insert("barbers", ["id", "shop_id", "name"], [ids.barberA, ids.shopA, "Barber A"]),
    insert("barbers", ["id", "shop_id", "name"], [ids.barberB, ids.shopB, "Barber B"]),
    insert("barber_user_links", ["shop_id", "user_id", "barber_id"], [ids.shopA, ids.barberUser, ids.barberA]),
    insert("bookings", ["id", "shop_id", "booking_code", "customer_id", "barber_id", "service_id", "booking_date", "start_time", "end_time", "total_price"], [ids.bookingA, ids.shopA, "A-1", ids.customerA, ids.barberA, ids.serviceA, "2026-10-07", "10:00", "10:30", 100]),
    insert("bookings", ["id", "shop_id", "booking_code", "customer_id", "barber_id", "service_id", "booking_date", "start_time", "end_time", "total_price"], [ids.bookingB, ids.shopB, "B-1", ids.customerB, ids.barberB, ids.serviceB, "2026-10-07", "10:00", "10:30", 200]),
    insert("gallery", ["id", "shop_id", "title", "image_url", "r2_key", "category"], [ids.galleryA, ids.shopA, "A Gallery", "https://images.test/a.jpg", "private/a-key", "Cuts"]),
    insert("gallery", ["id", "shop_id", "title", "image_url", "r2_key", "category"], [ids.galleryB, ids.shopB, "B Gallery", "https://images.test/b.jpg", "private/b-key", "Cuts"]),
    insert("reviews", ["id", "shop_id", "booking_id", "customer_id", "barber_id", "rating", "comment", "status"], [ids.reviewA, ids.shopA, ids.bookingA, ids.customerA, ids.barberA, 5, "Great cut A", "APPROVED"]),
    insert("reviews", ["id", "shop_id", "booking_id", "customer_id", "barber_id", "rating", "comment", "status"], [ids.reviewB, ids.shopB, ids.bookingB, ids.customerB, ids.barberB, 4, "Great cut B", "APPROVED"]),
    insert("shop_settings", ["id", "shop_id", "key", "value"], ["phase5-setting-a", ids.shopA, "business_name", "A Custom Brand"]),
    insert("shop_settings", ["id", "shop_id", "key", "value"], ["phase5-setting-b", ids.shopA, "primary_color", "#123456"]),
    insert("shop_settings", ["id", "shop_id", "key", "value"], ["phase5-private-setting", ids.shopA, "payment_secret", "must-not-leak"]),
  );
  const path = resolve(root, ".wrangler/phase4-fixtures.sql");
  writeFileSync(path, `${statements.join("\n")}\n`);
  try { runWrangler(["d1", "execute", "barbersaas-db", "--local", `--file=${path}`]); }
  finally { rmSync(path, { force: true }); }
  fixturesApplied = true;
}

function removeFixtures() {
  if (!fixturesApplied) return;
  const path = resolve(root, ".wrangler/phase4-cleanup.sql");
  writeFileSync(path, `DELETE FROM shops WHERE id IN (${sql(ids.shopA)},${sql(ids.shopB)},${sql(ids.shopSuspended)},${sql(ids.shopInactive)});\nDELETE FROM users WHERE id=${sql(ids.admin)};\n`);
  try { runWrangler(["d1", "execute", "barbersaas-db", "--local", `--file=${path}`]); }
  finally { rmSync(path, { force: true }); }
}

async function request(hostname, path, { method = "GET", cookie, body } = {}) {
  const headers = { "x-forwarded-host": hostname, ...(cookie ? { cookie } : {}) };
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function signIn(hostname, email) {
  const response = await request(hostname, "/auth/login", { method: "POST", body: { email, password } });
  assert.equal(response.status, 200, `login ${email}: ${await response.clone().text()}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(setCookie.includes(flag), `cookie missing ${flag}`);
  const payload = await response.json();
  assert.equal(Object.hasOwn(payload.data.user, "password_hash"), false);
  return setCookie.split(";")[0];
}

async function waitForWorker() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (worker.exitCode !== null) throw new Error("Wrangler local Worker exited before becoming ready");
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok && response.headers.get("content-type")?.includes("application/json")) return;
    } catch { /* starting */ }
    await delay(250);
  }
  throw new Error("Wrangler local Worker did not start in time");
}

const results = [];
async function test(name, callback) {
  try { await callback(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`); }
}

async function main() {
  writeFileSync(localVars, "APP_ENV=development\nPLATFORM_DOMAIN=platform.test\nCORS_ALLOWED_ORIGINS=http://localhost:5173\n");
  try {
    runWrangler(["d1", "migrations", "apply", "barbersaas-db", "--local"]);
    writeFixtures();
    worker = spawn(process.execPath, [wrangler, ...withIsolatedLocalPersistence(["dev", "--config", "wrangler.jsonc", "--local", "--ip", host, "--port", String(port), "--var", "APP_ENV:development", "--log-level", "info"], root, "phase4")], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let workerOutput = "";
    worker.stdout.on("data", (chunk) => { workerOutput += chunk.toString(); });
    worker.stderr.on("data", (chunk) => { workerOutput += chunk.toString(); });
    await waitForWorker().catch((error) => { throw new Error(`${error.message}\n${workerOutput}`); });

    await test("Test 1: Shop A customer login and own Shop A bookings", async () => {
      const cookie = await signIn("shop-a.test", "customer-a@phase4.test");
      const response = await request("shop-a.test", "/customer/bookings", { cookie });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data.map((item) => item.id), [ids.bookingA]);
    });
    await test("Test 2: Shop A customer cannot read Shop B bookings", async () => {
      const cookie = await signIn("shop-a.test", "customer-a@phase4.test");
      const response = await request("phase4-a.platform.test", "/customer/bookings", { cookie });
      assert.equal(response.status, 401);
      assert.ok(!(await response.text()).includes(ids.bookingB));
    });
    await test("Test 3: Shop A owner sees only Shop A services and cannot reuse session on Shop B", async () => {
      const cookie = await signIn("shop-a.test", "owner-a@phase4.test");
      const response = await request("shop-a.test", "/shop/services", { cookie });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data.map((item) => item.id), [ids.serviceA]);
      assert.equal((await request("phase4-a.platform.test", "/shop/services", { cookie })).status, 401);
    });
    await test("Test 4: Customer cannot access Shop Owner APIs", async () => {
      const cookie = await signIn("shop-a.test", "customer-a@phase4.test");
      assert.equal((await request("shop-a.test", "/shop/services", { cookie })).status, 403);
    });
    await test("Test 5: Shop Owner cannot access Super Admin APIs", async () => {
      const cookie = await signIn("shop-a.test", "owner-a@phase4.test");
      assert.equal((await request("platform.test", "/super-admin/shops", { cookie })).status, 401);
    });
    await test("Test 6: Super Admin can access global API", async () => {
      const cookie = await signIn("platform.test", "admin@phase4.test");
      const response = await request("platform.test", "/super-admin/shops", { cookie });
      assert.equal(response.status, 200);
      const shopIds = (await response.json()).data.items.map((shop) => shop.id);
      assert.ok(shopIds.includes(ids.shopA) && shopIds.includes(ids.shopB));
    });
    await test("Test 7: Unauthenticated protected API returns 401", async () => {
      assert.equal((await request("shop-a.test", "/shop/services")).status, 401);
    });
    await test("Test 8: Authenticated wrong role returns 403", async () => {
      const cookie = await signIn("shop-a.test", "customer-a@phase4.test");
      assert.equal((await request("shop-a.test", "/shop/bookings", { cookie })).status, 403);
    });
    await test("Customer registration uses hostname tenant and cannot choose role/shop_id", async () => {
      const response = await request("shop-a.test", "/auth/register", { method: "POST", body: { name: "New Customer", email: "new@phase4.test", password, shop_id: ids.shopB, role: "SHOP_OWNER" } });
      assert.equal(response.status, 201);
      const me = await request("shop-a.test", "/auth/me", { cookie: response.headers.get("set-cookie")?.split(";")[0] });
      const payload = await me.json();
      assert.equal(payload.data.user.shop_id, ids.shopA);
      assert.equal(payload.data.user.role, "CUSTOMER");
      assert.equal(Object.hasOwn(payload.data.user, "password_hash"), false);
    });
    await test("Custom domain and platform subdomain resolve tenant; unknown tenant returns 404", async () => {
      const custom = await request("shop-a.test", "/public/shop");
      assert.equal((await custom.json()).data.id, ids.shopA);
      const subdomain = await request("phase4-b.platform.test", "/public/shop");
      assert.equal((await subdomain.json()).data.id, ids.shopB);
      const exactDomainWins = await request("phase4-a.platform.test", "/public/shop");
      assert.equal((await exactDomainWins.json()).data.id, ids.shopB);
      const missing = await request("missing.test", "/public/shop");
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).message, "Shop not found");
    });
    await test("IDOR: customer cannot address another shop's booking by ID", async () => {
      const cookie = await signIn("shop-a.test", "customer-a@phase4.test");
      assert.equal((await request("shop-a.test", `/customer/bookings/${ids.bookingB}`, { cookie })).status, 404);
    });
    await test("Refresh rotates the session and logout revokes it", async () => {
      const oldCookie = await signIn("shop-a.test", "customer-a@phase4.test");
      const refreshed = await request("shop-a.test", "/auth/refresh", { method: "POST", cookie: oldCookie });
      assert.equal(refreshed.status, 200);
      const newCookie = refreshed.headers.get("set-cookie")?.split(";")[0] ?? "";
      assert.equal((await request("shop-a.test", "/auth/me", { cookie: oldCookie })).status, 401);
      assert.equal((await request("shop-a.test", "/auth/me", { cookie: newCookie })).status, 200);
      assert.equal((await request("shop-a.test", "/auth/logout", { method: "POST", cookie: newCookie })).status, 200);
      assert.equal((await request("shop-a.test", "/auth/me", { cookie: newCookie })).status, 401);
    });
    await test("An account from Shop B cannot log in through Shop A hostname", async () => {
      const response = await request("shop-a.test", "/auth/login", { method: "POST", body: { email: "customer-b@phase4.test", password } });
      assert.equal(response.status, 401);
    });
    await test("Barber can only list bookings assigned to their linked barber profile", async () => {
      const cookie = await signIn("shop-a.test", "barber-a@phase4.test");
      const response = await request("shop-a.test", "/shop/bookings", { cookie });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data.items.map((booking) => booking.id), [ids.bookingA]);
      assert.equal((await request("shop-a.test", "/shop/services", { cookie })).status, 403);
    });
    await test("Shop Owner cannot mutate a cross-tenant resource via an unimplemented write route", async () => {
      const cookie = await signIn("shop-a.test", "owner-a@phase4.test");
      const response = await request("shop-a.test", `/shop/services/${ids.serviceB}`, { method: "PATCH", cookie, body: { name: "tampered" } });
      assert.equal(response.status, 404);
    });

    await test("Public shop branding is hostname resolved and only exposes allowlisted settings", async () => {
      const response = await request("shop-a.test", "/public/shop");
      assert.equal(response.status, 200);
      const shop = (await response.json()).data;
      assert.equal(shop.id, ids.shopA);
      assert.equal(shop.name, "A Custom Brand");
      assert.equal(shop.settings.primary_color, "#123456");
      assert.equal(Object.hasOwn(shop.settings, "payment_secret"), false);
      assert.equal(Object.hasOwn(shop, "plan"), false);
      assert.equal((await (await request("phase4-b.platform.test", "/public/shop")).json()).data.id, ids.shopB);
    });
    await test("Public services, barbers, gallery, and reviews remain isolated by hostname", async () => {
      for (const [hostname, serviceId, barberId, galleryId, reviewComment] of [
        ["shop-a.test", ids.serviceA, ids.barberA, ids.galleryA, "Great cut A"],
        ["phase4-b.platform.test", ids.serviceB, ids.barberB, ids.galleryB, "Great cut B"],
      ]) {
        const services = await request(hostname, "/public/services");
        assert.deepEqual((await services.json()).data.map((item) => item.id), [serviceId]);
        const barbers = await request(hostname, "/public/barbers");
        assert.deepEqual((await barbers.json()).data.map((item) => item.id), [barberId]);
        const gallery = await request(hostname, "/public/gallery");
        const galleryData = (await gallery.json()).data;
        assert.deepEqual(galleryData.map((item) => item.id), [galleryId]);
        assert.equal(Object.hasOwn(galleryData[0], "r2_key"), false);
        const reviews = await request(hostname, "/public/reviews");
        const reviewData = (await reviews.json()).data;
        assert.deepEqual(reviewData.map((item) => item.comment), [reviewComment]);
        assert.equal(Object.hasOwn(reviewData[0], "email"), false);
        assert.equal(Object.hasOwn(reviewData[0], "phone"), false);
        assert.equal(Object.hasOwn(reviewData[0], "customer_id"), false);
      }
    });
    await test("Shop A cannot resolve Shop B barber by ID; suspended shop advertises status but data routes stop", async () => {
      const crossBarber = await request("shop-a.test", `/public/barbers/${ids.barberB}`);
      assert.equal(crossBarber.status, 404);
      assert.equal((await crossBarber.json()).message, "Barber not found");
      const shop = await request("paused.test", "/public/shop");
      assert.equal((await shop.json()).data.status, "SUSPENDED");
      assert.equal((await request("paused.test", "/public/services")).status, 403);
      const inactive = await request("inactive.test", "/public/shop");
      assert.equal((await inactive.json()).data.status, "INACTIVE");
      assert.equal((await request("inactive.test", "/public/services")).status, 403);
    });

    console.log(results.join("\n"));
    const failures = results.filter((result) => result.startsWith("FAIL"));
    if (failures.length) { console.error("Worker diagnostics:", workerOutput); process.exitCode = 1; }
  } finally {
    if (worker && worker.exitCode === null) { worker.kill("SIGTERM"); await Promise.race([new Promise((resolveExit) => worker.once("exit", resolveExit)), delay(3000)]); }
    try { removeFixtures(); } catch (error) { console.error("Could not remove test fixtures from local D1:", error); process.exitCode = 1; }
    if (hadLocalVars && originalLocalVars) writeFileSync(localVars, originalLocalVars);
    else rmSync(localVars, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
