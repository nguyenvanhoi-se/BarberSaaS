import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const config = JSON.parse(read("wrangler.jsonc"));
const productionDb = config.d1_databases.find((binding) => binding.binding === "DB");
const stagingDb = config.env?.staging?.d1_databases?.find((binding) => binding.binding === "DB");

assert.ok(productionDb, "base Worker must keep the application DB binding");
assert.equal(productionDb.database_name, "barbersaas-db");
assert.equal(productionDb.database_id, "00000000-0000-0000-0000-000000000000", "production stays blocked until Cloudflare assigns a real database ID");
assert.notEqual(productionDb.remote, true, "default local development must not write to a remote D1 database");
assert.ok(stagingDb, "staging must declare its own DB binding");
assert.equal(stagingDb.database_name, "barbersaas-staging-db");
assert.equal(stagingDb.database_id, "d32ec225-aa1b-4bf9-83a4-c3f2b87c4064");
assert.equal(stagingDb.remote, true, "only explicit staging configuration may use remote D1");
assert.equal(config.r2_buckets, undefined, "R2 stays disabled in the base environment");
assert.equal(config.env.staging.r2_buckets, undefined, "R2 stays disabled in staging until provisioned");

const bindings = read("src/server/types/bindings.ts");
assert.match(bindings, /MEDIA_BUCKET\?:\s*R2Bucket/u, "Worker must compile without an R2 binding");
const health = read("src/server/routes/health.routes.ts");
assert.match(health, /database:\s*"ok"/u);
assert.match(health, /MEDIA_BUCKET\s*\?\s*"configured"\s*:\s*"not_configured"/u);
assert.match(read("src/server/routes/shop-media.routes.ts"), /requireMediaBucket\(context\.env\.MEDIA_BUCKET\)/u);
assert.match(read("src/server/routes/auth.routes.ts"), /requireMediaBucket\(context\.env\.MEDIA_BUCKET\)/u);

const bookingPage = read("src/client/pages/BookingWizard.tsx");
assert.match(bookingPage, /sessionStorage\.(?:getItem|setItem|removeItem)/u, "only the resumable booking UI draft may use sessionStorage");
assert.doesNotMatch(bookingPage, /localStorage/u, "booking page must not persist primary booking data in localStorage");
assert.match(read("src/server/repositories/booking.repository.ts"), /INSERT INTO bookings/u, "booking records remain persisted in D1");

for (const path of [
  "public/images/image-placeholder.svg",
  "public/images/barbershop-hero.svg",
]) assert.ok(existsSync(resolve(root, path)), `missing static fallback image: ${path}`);
assert.match(read("src/client/components/Image.tsx"), /image-placeholder\.svg/u);
assert.match(read("src/client/pages/HomePage.tsx"), /barbershop-hero\.svg/u);
assert.match(read("src/client/components/Cards.tsx"), /export function ServiceCard[\s\S]*?<Image/u);
assert.match(read("src/client/components/Cards.tsx"), /export function BarberCard[\s\S]*?<Image/u);
assert.match(read("src/client/components/GalleryGrid.tsx"), /<Image/u);

const deployGuard = read("scripts/deploy-worker.mjs");
assert.match(deployGuard, /00000000-0000-0000-0000-000000000000/u);
assert.match(deployGuard, /deployment is blocked/iu);

console.log("PASS Free-first configuration: isolated D1 environments, optional R2, D1-backed bookings, UI-only session draft, static image fallbacks, and production deploy guard");
