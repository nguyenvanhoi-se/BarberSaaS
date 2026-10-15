import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Give every Wrangler-backed test suite an isolated, per-run D1/R2 persistence directory. */
export function withIsolatedLocalPersistence(args, root, suite) {
  const localIndex = args.indexOf("--local");
  if (localIndex < 0 || args.includes("--persist-to")) return args;

  const runId = process.env.WRANGLER_TEST_RUN_ID ?? `manual-${process.pid}`;
  const directory = resolve(root, ".wrangler", "test-state", runId, suite);
  mkdirSync(directory, { recursive: true });
  return [...args.slice(0, localIndex + 1), "--persist-to", directory, ...args.slice(localIndex + 1)];
}
