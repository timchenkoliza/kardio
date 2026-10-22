import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "@/db/connection-string";

const NEON = "postgresql://user:p%40ss%3Fword@ep-example-123.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

/** `process.emitWarning` delivers on the next tick. */
const flush = () => new Promise(resolve => setImmediate(resolve));

describe("database connection string", () => {
  it("rewrites the sslmode aliases pg already treats as verify-full", () => {
    expect(normalizeDatabaseUrl(NEON)).toBe("postgresql://user:p%40ss%3Fword@ep-example-123.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=verify-full");
    expect(normalizeDatabaseUrl("postgresql://u:p@h/db?sslmode=prefer")).toBe("postgresql://u:p@h/db?sslmode=verify-full");
    expect(normalizeDatabaseUrl("postgresql://u:p@h/db?sslmode=verify-ca&connect_timeout=15")).toBe("postgresql://u:p@h/db?sslmode=verify-full&connect_timeout=15");
  });

  it("leaves every other mode, an absent mode and the rest of the string alone", () => {
    for (const url of [
      "postgresql://kardio:kardio@127.0.0.1:55432/kardio",
      "postgresql://u:p@h/db?sslmode=verify-full",
      "postgresql://u:p@h/db?sslmode=disable",
      "postgresql://u:p@h/db?sslmode=no-verify",
      "postgresql://u:p@h/db?channel_binding=require",
      "postgresql://u:p@h/db?sslmode=required",
      "postgresql://u:p@h/db?xsslmode=require",
      "postgresql://u:p@h/db?sslmode=REQUIRE",
    ]) expect(normalizeDatabaseUrl(url)).toBe(url);
  });

  it("keeps the ssl semantics the driver applies today and stops the warning", async () => {
    const warnings: string[] = [];
    const listen = (warning: Error) => { warnings.push(warning.message); };
    process.on("warning", listen);
    try {
      const normalized = new Client({ connectionString: normalizeDatabaseUrl(NEON) });
      await flush();
      expect(warnings.filter(message => message.includes("SECURITY WARNING"))).toEqual([]);
      expect(normalized.ssl).not.toBe(false);
      expect(normalized.host).toBe("ep-example-123.us-east-1.aws.neon.tech");
      expect(normalized.password).toBe("p@ss?word");

      // Positive control: the alias as delivered by the integration is what warns.
      const original = new Client({ connectionString: NEON });
      await flush();
      expect(original.ssl).toEqual(normalized.ssl);
      expect(warnings.some(message => message.includes("SECURITY WARNING"))).toBe(true);
    } finally {
      process.off("warning", listen);
    }
  });

  describe("pool", () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

    it("is created with the normalized connection string", async () => {
      vi.stubEnv("DATABASE_URL", NEON);
      vi.resetModules();
      const { pool } = await import("@/db/client");
      expect(pool.options.connectionString).toBe(normalizeDatabaseUrl(NEON));
      expect(pool.options.connectionString).not.toContain("sslmode=require");
    });
  });
});
