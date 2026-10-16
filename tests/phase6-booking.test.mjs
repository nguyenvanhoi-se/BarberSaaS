import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withIsolatedLocalPersistence } from "./wrangler-test-utils.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const host = "127.0.0.1";
const port = 8792;
const base = `http://${host}:${port}`;
const password = "Phase6-Booking-Password-123!";
const workDate = new Date();
workDate.setUTCDate(workDate.getUTCDate() + 7);
const date = workDate.toISOString().slice(0, 10);
const closedDateValue = new Date(workDate);
closedDateValue.setUTCDate(closedDateValue.getUTCDate() + 1);
const closedDate = closedDateValue.toISOString().slice(0, 10);
const closedWeekday = closedDateValue.getUTCDay();
const shopClosedDateValue = new Date(workDate);
shopClosedDateValue.setUTCDate(shopClosedDateValue.getUTCDate() + 2);
const shopClosedDate = shopClosedDateValue.toISOString().slice(0, 10);
const shopClosedWeekday = shopClosedDateValue.getUTCDay();
const ids = {
  shopA: "phase6-shop-a", shopB: "phase6-shop-b", customerA: "phase6-customer-a", customerA2: "phase6-customer-a2",
  ownerA: "phase6-owner-a", ownerB: "phase6-owner-b", barberUserA: "phase6-barber-user-a", barberUserA2: "phase6-barber-user-a2",
  customerB: "phase6-customer-b", barberA: "phase6-barber-a", barberA2: "phase6-barber-a2", barberB: "phase6-barber-b",
  serviceA: "phase6-service-a", serviceLong: "phase6-service-long", serviceB: "phase6-service-b",
};
const env = { ...process.env, XDG_CONFIG_HOME: resolve(root, ".wrangler/config") };
const localVars = resolve(root, ".dev.vars");
const hadLocalVars = existsSync(localVars);
const originalLocalVars = hadLocalVars ? readFileSync(localVars) : null;
let worker;
let fixturesApplied = false;
const createdBookingIds = new Map();

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...withIsolatedLocalPersistence(args, root, "phase6")], { cwd: root, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`wrangler ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
}
function queryLocalD1(query) {
  const result = spawnSync(process.execPath, [wrangler, ...withIsolatedLocalPersistence(["d1", "execute", "barbersaas-db", "--local", "--command", query, "--json"], root, "phase6")], { cwd: root, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`D1 query failed:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}
function sql(value) { return value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function insert(table, columns, values) { return `INSERT INTO ${table} (${columns.join(",")}) VALUES (${values.map(sql).join(",")});`; }
function makePasswordHash(value) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(value, salt, 600_000, 32, "sha256");
  return `pbkdf2-sha256$600000$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function writeFixtures() {
  const hash = makePasswordHash(password);
  const statements = [
    `DELETE FROM shops WHERE id IN (${sql(ids.shopA)},${sql(ids.shopB)});`,
    insert("shops", ["id", "name", "slug", "domain", "status"], [ids.shopA, "Phase 6 Booking A", "phase6-a", "booking-a.test", "ACTIVE"]),
    insert("shops", ["id", "name", "slug", "domain", "status"], [ids.shopB, "Phase 6 Booking B", "phase6-b", "booking-b.test", "ACTIVE"]),
    ...[[ids.shopA,"booking-a.test"],[ids.shopB,"booking-b.test"]].map(([shopId,hostname])=>insert("shop_domains",["id","shop_id","hostname","type","status","verification_status","ssl_status"],[`domain-${shopId}`,shopId,hostname,"CUSTOM_DOMAIN","ACTIVE","ACTIVE","ACTIVE"])),
    insert("subscriptions", ["id", "shop_id", "plan", "status", "started_at", "expired_at"], ["phase6-sub-a", ids.shopA, "BASIC", "ACTIVE", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]),
    insert("subscriptions", ["id", "shop_id", "plan", "status", "started_at", "expired_at"], ["phase6-sub-b", ids.shopB, "BASIC", "ACTIVE", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]),
  ];
  for (const [id, shop, name, email, role] of [
    [ids.customerA, ids.shopA, "Booking Customer A", "booking-customer-a@phase6.test", "CUSTOMER"],
    [ids.customerA2, ids.shopA, "Booking Customer A2", "booking-customer-a2@phase6.test", "CUSTOMER"],
    [ids.ownerA, ids.shopA, "Booking Owner A", "booking-owner-a@phase6.test", "SHOP_OWNER"],
    [ids.barberUserA, ids.shopA, "Booking Barber A", "booking-barber-a@phase6.test", "BARBER"],
    [ids.barberUserA2, ids.shopA, "Booking Barber A2", "booking-barber-a2@phase6.test", "BARBER"],
    [ids.customerB, ids.shopB, "Booking Customer B", "booking-customer-b@phase6.test", "CUSTOMER"],
    [ids.ownerB, ids.shopB, "Booking Owner B", "booking-owner-b@phase6.test", "SHOP_OWNER"],
  ]) statements.push(insert("users", ["id", "shop_id", "name", "email", "password_hash", "role", "status"], [id, shop, name, email, hash, role, "ACTIVE"]));
  for (const [id, shop, name] of [[ids.barberA, ids.shopA, "Barber Alpha"], [ids.barberA2, ids.shopA, "Barber Beta"], [ids.barberB, ids.shopB, "Barber Other Shop"]]) {
    statements.push(insert("barbers", ["id", "shop_id", "name"], [id, shop, name]));
  }
  statements.push(
    insert("barber_user_links", ["shop_id", "user_id", "barber_id"], [ids.shopA, ids.barberUserA, ids.barberA]),
    insert("barber_user_links", ["shop_id", "user_id", "barber_id"], [ids.shopA, ids.barberUserA2, ids.barberA2]),
    insert("services", ["id", "shop_id", "name", "price", "duration_minutes", "status"], [ids.serviceA, ids.shopA, "Phase 6 Cut", 150000, 30, "ACTIVE"]),
    insert("services", ["id", "shop_id", "name", "price", "duration_minutes", "status"], [ids.serviceLong, ids.shopA, "Phase 6 Long Service", 400000, 60, "ACTIVE"]),
    insert("services", ["id", "shop_id", "name", "price", "duration_minutes", "status"], [ids.serviceB, ids.shopB, "Other Shop Cut", 999000, 30, "ACTIVE"]),
    insert("shop_settings", ["id", "shop_id", "key", "value"], ["phase6-slot-setting", ids.shopA, "slot_interval_minutes", "15"]),
    insert("shop_settings", ["id", "shop_id", "key", "value"], ["phase6-shop-hours", ids.shopA, "opening_hours", JSON.stringify({ [(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"])[shopClosedWeekday]]: { closed: true } })]),
  );
  for (const [barber, shop] of [[ids.barberA, ids.shopA], [ids.barberA2, ids.shopA], [ids.barberB, ids.shopB]]) {
    for (let day = 0; day <= 6; day += 1) {
      const dayOff = shop === ids.shopA && day === closedWeekday;
      statements.push(insert("barber_working_hours", ["id", "shop_id", "barber_id", "day_of_week", "start_time", "end_time", "is_day_off"],
        [randomUUID(), shop, barber, day, dayOff ? null : "09:00", dayOff ? null : "12:00", dayOff ? 1 : 0]));
    }
  }
  const path = resolve(root, ".wrangler/phase6-fixtures.sql");
  writeFileSync(path, `${statements.join("\n")}\n`);
  try { runWrangler(["d1", "execute", "barbersaas-db", "--local", `--file=${path}`]); }
  finally { rmSync(path, { force: true }); }
  fixturesApplied = true;
}

function removeFixtures() {
  if (!fixturesApplied) return;
  const path = resolve(root, ".wrangler/phase6-cleanup.sql");
  writeFileSync(path, `DELETE FROM audit_logs WHERE shop_id IN (${sql(ids.shopA)},${sql(ids.shopB)});\nDELETE FROM shops WHERE id IN (${sql(ids.shopA)},${sql(ids.shopB)});\n`);
  try { runWrangler(["d1", "execute", "barbersaas-db", "--local", `--file=${path}`]); }
  finally { rmSync(path, { force: true }); }
}

async function request(hostname, path, { method = "GET", cookie, body } = {}) {
  const headers = { "x-forwarded-host": hostname, ...(cookie ? { cookie } : {}) };
  if (body !== undefined) headers["content-type"] = "application/json";
  for (let attempt = 0; ; attempt += 1) {
    try { return await fetch(`${base}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch (error) { if (attempt >= 2) throw error; await delay(150); }
  }
}
async function signIn(hostname, email) {
  const response = await request(hostname, "/auth/login", { method: "POST", body: { email, password } });
  assert.equal(response.status, 200, `login ${email}: ${await response.clone().text()}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function makeBooking(cookie, options = {}) {
  const response = await request("booking-a.test", "/customer/bookings", { method: "POST", cookie, body: {
    service_id: ids.serviceA, barber_id: ids.barberA, booking_date: date, start_time: "09:00", ...options,
  } });
  if (response.ok) {
    const data = (await response.json()).data;
    createdBookingIds.set(data.booking_code, data.id);
    return data;
  }
  return { status: response.status, ...(await response.json()) };
}
async function waitForWorker() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (worker.exitCode !== null) throw new Error("Wrangler local Worker exited before becoming ready");
    try { const response = await fetch(`${base}/api/health`); if (response.ok) return; } catch { /* starting */ }
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
    worker = spawn(process.execPath, [wrangler, ...withIsolatedLocalPersistence(["dev", "--config", "wrangler.jsonc", "--local", "--ip", host, "--port", String(port), "--var", "APP_ENV:development", "--log-level", "error"], root, "phase6")], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let workerOutput = "";
    worker.stdout.on("data", (chunk) => { workerOutput += chunk.toString(); });
    worker.stderr.on("data", (chunk) => { workerOutput += chunk.toString(); });
    await waitForWorker().catch((error) => { throw new Error(`${error.message}\n${workerOutput}`); });

    const readiness = await fetch(`${base}/api/health/ready`);
    assert.equal(readiness.status, 200, await readiness.clone().text());
    const readinessData = (await readiness.json()).data;
    assert.equal(readinessData.checks.database, "ok");
    assert.equal(readinessData.checks.media_storage, "not_configured");

    const customerA = await signIn("booking-a.test", "booking-customer-a@phase6.test");
    const customerA2 = await signIn("booking-a.test", "booking-customer-a2@phase6.test");
    const ownerA = await signIn("booking-a.test", "booking-owner-a@phase6.test");
    const barberA2 = await signIn("booking-a.test", "booking-barber-a2@phase6.test");
    const customerB = await signIn("booking-b.test", "booking-customer-b@phase6.test");
    const ownerB = await signIn("booking-b.test", "booking-owner-b@phase6.test");

    await test("Available slots follow working hours, slot interval and service duration", async () => {
      const response = await request("booking-a.test", `/public/booking/available-slots?date=${date}&service_id=${ids.serviceA}`);
      assert.equal(response.status, 200);
      const payload = (await response.json()).data;
      assert.equal(payload.date, date);
      assert.equal(payload.slots[0].start_time, "09:00");
      assert.equal(payload.slots[0].end_time, "09:30");
      assert.equal(payload.slots[0].barber_id, ids.barberA);
      assert.ok(payload.slots.some((slot) => slot.start_time === "11:45" && slot.end_time === "12:15") === false);
      const long = await request("booking-a.test", `/public/booking/available-slots?date=${date}&service_id=${ids.serviceLong}&barber_id=${ids.barberA}`);
      assert.equal(long.status, 200);
      assert.equal((await long.json()).data.slots.at(-1).end_time, "12:00");
    });
    await test("Shop closed/day-off date has no slots", async () => {
      const response = await request("booking-a.test", `/public/booking/available-slots?date=${closedDate}&service_id=${ids.serviceA}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.slots.length, 0);
      const shopClosed = await request("booking-a.test", `/public/booking/available-slots?date=${shopClosedDate}&service_id=${ids.serviceA}`);
      assert.equal((await shopClosed.json()).data.shop_closed, true);
      assert.equal((await makeBooking(customerA, { booking_date: shopClosedDate })).status, 409);
    });
    await test("Successful booking calculates authoritative price, end time, code and audit log", async () => {
      const booking = await makeBooking(customerA, { note: "Window seat", price: 1, total_price: 1, end_time: "09:01" });
      assert.equal(booking.status, 422, "client supplied price/end fields are rejected");
      const created = await makeBooking(customerA);
      assert.equal(created.status, "PENDING");
      assert.equal(created.total_price, 150000);
      assert.equal(created.end_time, "09:30");
      assert.match(created.booking_code, /^BK-[A-F0-9]{16}$/u);
      const createAudit = queryLocalD1(`SELECT COUNT(*) AS total FROM audit_logs WHERE shop_id='${ids.shopA}' AND entity_id='${created.id}' AND action='CREATE_BOOKING'`);
      assert.equal(createAudit[0].results[0].total, 1);
      const persistedBooking = queryLocalD1(`SELECT id, shop_id, total_price, end_time FROM bookings WHERE id='${created.id}'`);
      assert.equal(persistedBooking[0].results[0].shop_id, ids.shopA, "booking is persisted in tenant-scoped D1 without R2");
      assert.equal(persistedBooking[0].results[0].total_price, 150000);
      assert.equal(persistedBooking[0].results[0].end_time, "09:30");
      const detail = await request("booking-a.test", `/customer/bookings/${created.id}`, { cookie: customerA });
      assert.equal(detail.status, 200);
      const logs = await request("booking-a.test", "/shop/bookings", { cookie: ownerA });
      assert.equal(logs.status, 200);
      assert.ok((await logs.json()).data.items.some((item) => item.id === created.id));
      const result = await request("booking-a.test", "/shop/bookings", { cookie: ownerA });
      assert.ok((await result.json()).data.items.length > 0);
    });
    await test("Exact duplicate and partially overlapping bookings return 409", async () => {
      assert.equal((await makeBooking(customerA)).status, 409);
      const overlap = await makeBooking(customerA, { start_time: "09:15" });
      assert.equal(overlap.status, 409);
      const slots = await request("booking-a.test", `/public/booking/available-slots?date=${date}&service_id=${ids.serviceA}&barber_id=${ids.barberA}`);
      const nineFifteen = (await slots.json()).data.slots.find((slot) => slot.start_time === "09:15");
      assert.equal(nineFifteen.available, false);
    });
    await test("Customer cancellation releases the slot and is audited", async () => {
      const detail = (await (await request("booking-a.test", "/customer/bookings", { cookie: customerA })).json()).data;
      const booking = detail.find((item) => item.booking_date === date && item.start_time === "09:00");
      assert.ok(booking);
      const cancelled = await request("booking-a.test", `/customer/bookings/${booking.id}/cancel`, { method: "PATCH", cookie: customerA });
      assert.equal(cancelled.status, 200);
      assert.equal((await cancelled.json()).data.status, "CANCELLED");
      assert.equal((await request("booking-a.test", `/customer/bookings/${booking.id}/cancel`, { method: "PATCH", cookie: customerA })).status, 409);
      const cancelAudit = queryLocalD1(`SELECT COUNT(*) AS total FROM audit_logs WHERE shop_id='${ids.shopA}' AND entity_id='${booking.id}' AND action='CANCEL_BOOKING'`);
      assert.equal(cancelAudit[0].results[0].total, 1);
      const slots = await request("booking-a.test", `/public/booking/available-slots?date=${date}&service_id=${ids.serviceA}&barber_id=${ids.barberA}`);
      assert.equal((await slots.json()).data.slots.find((slot) => slot.start_time === "09:00").available, true);
    });
    await test("Completed bookings continue to occupy their time and transitions are validated", async () => {
      const created = await makeBooking(customerA);
      assert.equal(created.status, "PENDING");
      const invalid = await request("booking-a.test", `/shop/bookings/${created.id}/status`, { method: "PATCH", cookie: ownerA, body: { status: "COMPLETED" } });
      assert.equal(invalid.status, 422);
      const confirmed = await request("booking-a.test", `/shop/bookings/${created.id}/status`, { method: "PATCH", cookie: ownerA, body: { status: "CONFIRMED" } });
      assert.equal(confirmed.status, 200);
      const completed = await request("booking-a.test", `/shop/bookings/${created.id}/status`, { method: "PATCH", cookie: ownerA, body: { status: "COMPLETED" } });
      assert.equal(completed.status, 200);
      assert.equal((await request("booking-a.test", `/customer/bookings/${created.id}/cancel`, { method: "PATCH", cookie: customerA })).status, 409);
      const audit = queryLocalD1(`SELECT action, COUNT(*) AS total FROM audit_logs WHERE shop_id='${ids.shopA}' AND entity_id='${created.id}' GROUP BY action`)[0].results;
      assert.ok(audit.some((row) => row.action === "CONFIRM_BOOKING" && row.total === 1));
      assert.ok(audit.some((row) => row.action === "COMPLETE_BOOKING" && row.total === 1));
      const slots = await request("booking-a.test", `/public/booking/available-slots?date=${date}&service_id=${ids.serviceA}&barber_id=${ids.barberA}`);
      assert.equal((await slots.json()).data.slots.find((slot) => slot.start_time === "09:00").available, false);
    });
    await test("Past dates, outside hours, shop day off, foreign service and foreign barber are rejected", async () => {
      const yesterday = new Date(); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      assert.equal((await makeBooking(customerA, { booking_date: yesterday.toISOString().slice(0, 10) })).status, 422);
      assert.equal((await makeBooking(customerA, { start_time: "12:00" })).status, 422);
      const dayOff = await makeBooking(customerA, { booking_date: closedDate });
      assert.equal(dayOff.status, 409);
      assert.equal((await makeBooking(customerA, { service_id: ids.serviceB })).status, 404);
      assert.equal((await makeBooking(customerA, { barber_id: ids.barberB })).status, 404);
      assert.equal((await makeBooking(customerA, { service_id: ids.serviceA, barber_id: ids.barberA2, start_time: "09:00" })).status, "PENDING");
    });
    await test("Any Barber assigns a deterministic available barber and fails when every barber is occupied", async () => {
      const selected = await makeBooking(customerA, { start_time: "10:00", barber_id: null });
      assert.equal(selected.status, "PENDING");
      assert.equal(selected.barber_id, ids.barberA);
      const other = await makeBooking(customerA, { start_time: "10:30", barber_id: ids.barberA2 });
      assert.equal(other.status, "PENDING");
      const second = await makeBooking(customerA, { start_time: "10:30", barber_id: ids.barberA });
      assert.equal(second.status, "PENDING");
      const none = await makeBooking(customerA, { start_time: "10:30", barber_id: null });
      assert.equal(none.status, 409);
    });
    await test("Cross-customer, cross-tenant and cross-barber booking IDOR is denied", async () => {
      const owned = await makeBooking(customerA, { start_time: "11:00" });
      assert.equal(owned.status, "PENDING");
      assert.equal((await request("booking-a.test", `/customer/bookings/${owned.id}`, { cookie: customerA2 })).status, 404);
      assert.equal((await request("booking-a.test", `/customer/bookings/${owned.id}/cancel`, { method: "PATCH", cookie: customerA2 })).status, 404);
      assert.equal((await request("booking-b.test", `/customer/bookings/${owned.id}`, { cookie: customerB })).status, 404);
      assert.equal((await request("booking-a.test", `/shop/bookings/${owned.id}`, { cookie: barberA2 })).status, 404);
      assert.equal((await request("booking-b.test", `/shop/bookings/${owned.id}`, { cookie: ownerB })).status, 404);
      assert.equal((await request("booking-b.test", `/shop/bookings/${owned.id}/status`, { method: "PATCH", cookie: ownerB, body: { status: "CANCELLED" } })).status, 404);
    });
    await test("Shop booking filters and pagination are tenant scoped", async () => {
      const response = await request("booking-a.test", `/shop/bookings?date=${date}&status=PENDING&page=1&limit=2`, { cookie: ownerA });
      assert.equal(response.status, 200);
      const page = (await response.json()).data;
      assert.equal(page.page, 1);
      assert.equal(page.limit, 2);
      assert.ok(page.items.length <= 2);
      assert.ok(page.items.every((booking) => booking.shop_id === ids.shopA && booking.status === "PENDING"));
    });
    await test("Concurrent attempts create only one booking for the same barber and time", async () => {
      const requests = await Promise.all([makeBooking(customerA, { start_time: "11:00", barber_id: null }), makeBooking(customerA2, { start_time: "11:00", barber_id: null })]);
      assert.equal(requests.filter((result) => result.status === "PENDING").length, 1);
      assert.equal(requests.filter((result) => result.status === 409).length, 1);
    });
    await test("Shop owner and barber actions are audit logged, barber only changes their own assignment", async () => {
      const own = await makeBooking(customerA, { start_time: "11:30", barber_id: ids.barberA2 });
      assert.equal(own.status, "PENDING");
      const forbidden = await request("booking-a.test", `/shop/bookings/${own.id}/status`, { method: "PATCH", cookie: barberA2, body: { status: "CONFIRMED" } });
      assert.equal(forbidden.status, 200);
      const completed = await request("booking-a.test", `/shop/bookings/${own.id}/status`, { method: "PATCH", cookie: barberA2, body: { status: "COMPLETED" } });
      assert.equal(completed.status, 200);
      assert.equal((await request("booking-a.test", `/shop/bookings/${own.id}/status`, { method: "PATCH", cookie: ownerA, body: { status: "CANCELLED" } })).status, 422);
    });

    console.log(results.join("\n"));
    if (results.some((result) => result.startsWith("FAIL"))) { console.error("Worker diagnostics:", workerOutput); process.exitCode = 1; }
  } finally {
    if (worker && worker.exitCode === null) { worker.kill("SIGTERM"); await Promise.race([new Promise((resolveExit) => worker.once("exit", resolveExit)), delay(3000)]); }
    try { removeFixtures(); } catch (error) { console.error("Could not remove Phase 6 fixtures from local D1:", error); process.exitCode = 1; }
    if (hadLocalVars && originalLocalVars) writeFileSync(localVars, originalLocalVars);
    else rmSync(localVars, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
