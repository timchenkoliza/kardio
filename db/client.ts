import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as legacySchema from "./schema";
import * as ontologySchema from "./ontology-schema";
import * as resolutionSchema from "./resolution-schema";

const schema = { ...legacySchema, ...ontologySchema, ...resolutionSchema };
const globals = globalThis as unknown as { kardioPool?: Pool };
export const pool = globals.kardioPool ?? new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://kardio:kardio@127.0.0.1:55432/kardio",
  max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
});
if (process.env.NODE_ENV !== "production") globals.kardioPool = pool;
export const db = drizzle(pool, { schema });
