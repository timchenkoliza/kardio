import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const standaloneDir = resolve(root, ".next/standalone");
const serverEntry = resolve(standaloneDir, "server.js");

if (!existsSync(serverEntry)) {
  throw new Error("Standalone build is missing. Run `npm run build` before starting Playwright.");
}

const standaloneNextDir = resolve(standaloneDir, ".next");
const standaloneStaticDir = resolve(standaloneNextDir, "static");
const standalonePublicDir = resolve(standaloneDir, "public");
const sourceStaticDir = resolve(root, ".next/static");
const sourcePublicDir = resolve(root, "public");

mkdirSync(standaloneNextDir, { recursive: true });
rmSync(standaloneStaticDir, { recursive: true, force: true });
cpSync(sourceStaticDir, standaloneStaticDir, { recursive: true });

rmSync(standalonePublicDir, { recursive: true, force: true });
if (existsSync(sourcePublicDir)) {
  cpSync(sourcePublicDir, standalonePublicDir, { recursive: true });
}

process.env.HOSTNAME ??= "127.0.0.1";
process.env.PORT ??= "3000";

await import(serverEntry);
