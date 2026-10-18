import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/db/client";
try { await migrate(db, { migrationsFolder: "db/migrations" }); console.log("PostgreSQL migrations applied."); }
catch (error) { console.error(error instanceof Error ? error.message : "Migration failed"); process.exitCode = 1; }
finally { await pool.end(); }
