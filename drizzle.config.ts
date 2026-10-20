import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: ["./db/schema.ts", "./db/ontology-schema.ts", "./db/resolution-schema.ts", "./db/agent-schema.ts"], out: "./db/migrations", dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://kardio:kardio@127.0.0.1:55432/kardio" },
});
