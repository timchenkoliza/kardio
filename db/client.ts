import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globals = globalThis as unknown as { kardioPool?: Pool };
export const pool = globals.kardioPool ?? new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://kardio:kardio@127.0.0.1:55432/kardio",
  max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
});
if (process.env.NODE_ENV !== "production") globals.kardioPool = pool;
export const db = drizzle(pool, { schema });
