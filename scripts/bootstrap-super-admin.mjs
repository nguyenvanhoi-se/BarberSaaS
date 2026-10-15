import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const sqlFile = resolve(root, `.wrangler/bootstrap-super-admin-${randomUUID()}.sql`);
const name = process.env.SUPER_ADMIN_NAME?.trim();
const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

function stop(message) { throw new Error(message); }
function quote(value) { return `'${value.replaceAll("'", "''")}'`; }
function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, XDG_CONFIG_HOME: resolve(root, ".wrangler/config") },
  });
  if (result.error || result.status !== 0) stop("Wrangler failed. No credential values were printed by this bootstrap script.");
  return result.stdout;
}
function resultCount(output, column) {
  const match = output.match(new RegExp(`"${column}"\\s*:\\s*(\\d+)`, "u"));
  return match ? Number(match[1]) : null;
}

if (!name || name.length > 120) stop("Set SUPER_ADMIN_NAME (1 to 120 characters).");
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) stop("Set SUPER_ADMIN_EMAIL to a valid address.");
if (!password || password.length < 12 || password.length > 128) stop("Set SUPER_ADMIN_PASSWORD to a password between 12 and 128 characters.");

try {
  const check = `SELECT COUNT(CASE WHEN role='SUPER_ADMIN' AND status='ACTIVE' THEN 1 END) AS active_admins, COUNT(CASE WHEN LOWER(email)=${quote(email)} THEN 1 END) AS email_matches FROM users;`;
  const inspected = run(["d1", "execute", "barbersaas-db", "--remote", "--command", check, "--json"]);
  const admins = resultCount(inspected, "active_admins");
  const emailMatches = resultCount(inspected, "email_matches");
  if (admins === null || emailMatches === null) stop("Could not safely verify the remote database state; no user was created.");
  if (admins > 0) stop("An active Super Admin already exists; bootstrap is disabled.");
  if (emailMatches > 0) stop("That email already exists; choose the account recovery process instead.");

  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, 600_000, 32, "sha256");
  const passwordHash = `pbkdf2-sha256$600000$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  const id = randomUUID();
  const sql = `INSERT INTO users(id,shop_id,name,email,password_hash,role,status)\nSELECT ${quote(id)},NULL,${quote(name)},${quote(email)},${quote(passwordHash)},'SUPER_ADMIN','ACTIVE'\nWHERE NOT EXISTS (SELECT 1 FROM users WHERE role='SUPER_ADMIN' AND status='ACTIVE')\n  AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(email)=${quote(email)});\nSELECT changes() AS created;\n`;
  mkdirSync(resolve(root, ".wrangler"), { recursive: true });
  writeFileSync(sqlFile, sql, { encoding: "utf8", flag: "wx" });
  const inserted = run(["d1", "execute", "barbersaas-db", "--remote", `--file=${sqlFile}`, "--json"]);
  if (resultCount(inserted, "created") !== 1) stop("Bootstrap did not create an administrator. Verify database state without resetting it.");
  console.log("Initial Super Admin created. The password is not displayed or retained in the repository.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Super Admin bootstrap failed.");
  process.exitCode = 1;
} finally {
  rmSync(sqlFile, { force: true });
}
