import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// Development-only native PostgreSQL, bound to loopback and persisted in ignored storage.
const databaseDir = path.resolve(".local/postgres");
mkdirSync(path.dirname(databaseDir), { recursive: true });
const postgres = new EmbeddedPostgres({ databaseDir, user: "kardio", password: "kardio", port: 55432, persistent: true, authMethod: "scram-sha-256", postgresFlags: ["-h", "127.0.0.1", "-k", path.resolve(".local")] });
if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await postgres.initialise();
await postgres.start();
const client = postgres.getPgClient("postgres", "127.0.0.1");
await client.connect();
const result = await client.query("select 1 from pg_database where datname = $1", ["kardio"]);
if (!result.rowCount) await postgres.createDatabase("kardio");
await client.end();
console.log("PostgreSQL ready on 127.0.0.1:55432; database kardio. Ctrl+C stops the server; data is retained.");
const stop = async () => { await postgres.stop(); process.exit(0); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
setInterval(() => {}, 60_000);
