import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ resolve: { alias: { "@": path.resolve("."), "server-only": path.resolve("tests/server-only.ts") } }, test: { environment: "node", fileParallelism: false, testTimeout: 20000, exclude: [...configDefaults.exclude, ".next/**", ".local/**"] } });
