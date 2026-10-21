#!/usr/bin/env node
/**
 * Vercel build entry (`vercel-build` takes precedence over `build` on Vercel).
 *
 * Preview deployments with a PostgreSQL database run the same steps as CI
 * before building: migrate → seed (idempotent) → verify. A Preview whose
 * database is missing schema or seed data fails its build loudly instead of
 * deploying a runtime that cannot keep a run. Production builds are not
 * changed: migrations there stay a deliberate step.
 *
 *   KARDIO_DB_ON_BUILD=0  skip the database steps on Preview
 */
import { spawnSync } from "node:child_process";

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const preview = process.env.VERCEL_ENV === "preview";
const database = Boolean(process.env.DATABASE_URL?.trim());
if (preview && database && process.env.KARDIO_DB_ON_BUILD !== "0") {
  run("npm", ["run", "db:migrate"]);
  run("npm", ["run", "db:seed"]);
  run("npm", ["run", "db:ontology-seed"]);
  run("npm", ["run", "db:verify"]);
} else if (preview) {
  console.log("Preview without DATABASE_URL: runs cannot be stored; the app answers 503 storage_unavailable until a database is connected.");
}
run("npx", ["next", "build"]);
