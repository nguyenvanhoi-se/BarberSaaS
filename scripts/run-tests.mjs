import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const suites = [
  { name: "phase4-auth-tenant", file: "tests/phase4-auth-tenant.test.mjs", integration: true },
  { name: "phase6-booking", file: "tests/phase6-booking.test.mjs", integration: true },
  { name: "phase7-admin", file: "tests/phase7-admin.test.mjs", integration: true },
  { name: "phase8-super-admin", file: "tests/phase8-super-admin.test.mjs", integration: true },
  { name: "phase10-subscriptions", file: "tests/phase10-subscriptions.test.mjs", integration: true },
  { name: "phase12-production", file: "tests/phase12-production.test.mjs", integration: true },
  { name: "phase14-billing", file: "tests/phase14-billing.test.mjs", integration: true },
  { name: "phase15-notifications", file: "tests/phase15-notifications.test.mjs" },
  { name: "free-first-config", file: "tests/free-first-config.test.mjs" },
  { name: "phase16-review", file: "tests/phase16-review.test.mjs" },
  { name: "phase16-authorization", file: "tests/phase16-authorization.test.mjs" },
];
const env = {
  ...process.env,
  CI: "true",
  XDG_CONFIG_HOME: resolve(root, ".wrangler", "config"),
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_TEST_RUN_ID: `${Date.now()}-${randomUUID()}`,
};
const results = [];

console.log("=== Migration validation (clean in-memory SQLite, before API integration suites) ===");
const migration = execute("tests/migrations.test.mjs");
results.push({ name: "migrations", status: migration.status, output: migration.output });
showResult(results.at(-1));

for (const suite of suites) {
  if (suite.integration && migration.status !== "PASS") {
    const result = { name: suite.name, status: "BLOCKED", output: "Migration validation failed; integration suite was not started." };
    results.push(result);
    showResult(result);
    continue;
  }
  const result = execute(suite.file);
  result.name = suite.name;
  results.push(result);
  showResult(result);
}

const counts = Object.fromEntries(["PASS", "FAIL", "BLOCKED"].map((status) => [status, results.filter((item) => item.status === status).length]));
console.log(`\nTEST SUMMARY: PASS=${counts.PASS} FAIL=${counts.FAIL} BLOCKED=${counts.BLOCKED}`);
if (counts.FAIL || counts.BLOCKED) process.exitCode = 1;

function execute(file) {
  const result = spawnSync(process.execPath, [resolve(root, file)], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status === 0) return { status: "PASS", output };
  if (result.error?.code === "ETIMEDOUT") return { status: "BLOCKED", output: `${output}\nTest process timed out after 120 seconds.` };
  if (/fetch failed|connect EACCES|EACCES 127\.0\.0\.1|EPERM.*listen|socket.*permission/iu.test(output)) {
    return { status: "BLOCKED", output };
  }
  return { status: "FAIL", output };
}

function showResult(result) {
  console.log(`${result.status.padEnd(7)} ${result.name}`);
  if (result.status !== "PASS" && result.output) console.log(result.output.trim().split(/\r?\n/u).slice(-32).join("\n"));
}
