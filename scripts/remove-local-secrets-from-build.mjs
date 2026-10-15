import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// The Cloudflare Vite plugin stages local .dev.vars for preview. It must never remain in release output.
rmSync(resolve(root, "dist/barbersaas/.dev.vars"), { force: true });
