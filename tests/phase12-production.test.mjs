import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withIsolatedLocalPersistence } from "./wrangler-test-utils.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const vars = resolve(root, ".dev.vars");
const hadVars = existsSync(vars);
const savedVars = hadVars ? readFileSync(vars) : null;
const host = "127.0.0.1";
const port = 8795;
const base = `http://${host}:${port}`;
const env = { ...process.env, XDG_CONFIG_HOME: resolve(root, ".wrangler/config") };
let worker;
let output = "";

function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...withIsolatedLocalPersistence(args, root, "phase12")], { cwd: root, env, encoding: "utf8" });
  assert.equal(result.status, 0, `${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
}

async function ready() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Worker starting */ }
    await delay(250);
  }
  throw new Error(`Worker failed to start: ${output}`);
}

async function main() {
  writeFileSync(vars, "APP_ENV=development\nPLATFORM_DOMAIN=platform.test\nCORS_ALLOWED_ORIGINS=http://localhost:5173\n");
  run(["d1", "migrations", "apply", "barbersaas-db", "--local"]);
  worker = spawn(process.execPath, [wrangler, ...withIsolatedLocalPersistence(["dev", "--config", "wrangler.jsonc", "--local", "--ip", host, "--port", String(port), "--var", "APP_ENV:development", "--log-level", "error"], root, "phase12")], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  worker.stdout.on("data", (chunk) => output += chunk);
  worker.stderr.on("data", (chunk) => output += chunk);
  try {
    await ready();
    const health = await fetch(`${base}/api/health`, { headers: { "X-Request-Id": "user-controlled" } });
    assert.equal(health.status, 200);
    assert.match(health.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/iu);
    assert.notEqual(health.headers.get("x-request-id"), "user-controlled");
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.equal(health.headers.get("referrer-policy"), "strict-origin-when-cross-origin");

    const readiness = await fetch(`${base}/api/health/ready`);
    assert.equal(readiness.status, 200, await readiness.clone().text());
    assert.equal((await readiness.json()).data.checks.database, "ok");

    const privateResponse = await fetch(`${base}/api/auth/me`);
    assert.equal(privateResponse.status, 401);
    assert.match(privateResponse.headers.get("cache-control") ?? "", /no-store/iu);

    const oversized = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(1024 * 1024 + 1) });
    assert.equal(oversized.status, 413, await oversized.clone().text());
    assert.equal((await oversized.json()).code, "PAYLOAD_TOO_LARGE");

    const blocked = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@example.test", password: "bad" }) });
    assert.equal(blocked.status, 403, await blocked.clone().text());
    assert.equal((await blocked.json()).code, "ORIGIN_NOT_ALLOWED");

    const notFound = await fetch(`${base}/api/does-not-exist`);
    assert.equal(notFound.status, 404);
    assert.doesNotMatch(await notFound.text(), /stack|wrangler|exception|node_modules/iu);

    const config = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));
    const expectedRateLimitBindings = ["AUTH_RATE_LIMIT", "BOOKING_RATE_LIMIT", "DOMAIN_RATE_LIMIT", "EMAIL_RATE_LIMIT", "UPLOAD_RATE_LIMIT"];
    assert.deepEqual(config.ratelimits.map((limit) => limit.name).sort(), expectedRateLimitBindings);
    assert.equal(new Set(config.ratelimits.map((limit) => limit.namespace_id)).size, expectedRateLimitBindings.length);

    worker.kill("SIGTERM");
    await Promise.race([new Promise((resolveExit) => worker.once("exit", resolveExit)), delay(3000)]);
    worker = spawn(process.execPath, [wrangler, ...withIsolatedLocalPersistence(["dev", "--config", "wrangler.jsonc", "--local", "--ip", host, "--port", String(port), "--var", "APP_ENV:production", "--var", "PLATFORM_DOMAIN:platform.test", "--var", "CORS_ALLOWED_ORIGINS:https://trusted.example", "--log-level", "error"], root, "phase12")], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    worker.stdout.on("data", (chunk) => output += chunk);
    worker.stderr.on("data", (chunk) => output += chunk);
    await ready();
    const productionReady = await fetch(`${base}/api/health/ready`);
    assert.equal(productionReady.status, 200, await productionReady.clone().text());
    assert.match(productionReady.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/iu);
    const productionOrigin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@example.test", password: "bad" }) });
    assert.equal(productionOrigin.status, 403);

    console.log("PASS Phase 12 request IDs, headers, CSP, readiness, private cache policy, payload limits, Origin guard, safe errors, and edge rate-limit bindings");
  } finally {
    if (worker && worker.exitCode === null) {
      worker.kill("SIGTERM");
      await Promise.race([new Promise((resolveExit) => worker.once("exit", resolveExit)), delay(3000)]);
    }
    if (savedVars) writeFileSync(vars, savedVars); else rmSync(vars, { force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
