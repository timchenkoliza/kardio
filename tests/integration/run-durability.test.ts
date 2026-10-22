import { afterAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { pool } from "@/db/client";
import { PostgresWorkspaceStore } from "@/server/agents/store/postgres";
import { workspaceStore } from "@/server/agents/store";
import { createAskRun, settleExpiredRun } from "@/server/portal/manager";
import { lookupRun } from "@/server/portal/run-state";
import { ensureSession } from "@/server/services/state";

describe("durable runs and stable sessions (PostgreSQL)", () => {
  it("concurrent first requests with the browser's id agree on one session — no rotation", async () => {
    const id = randomBytes(32).toString("hex");
    const sessions = await Promise.all([ensureSession(id), ensureSession(id), ensureSession(id)]);
    expect(new Set(sessions.map(session => session.id))).toEqual(new Set([id]));
    expect((await ensureSession(id)).created).toBe(false);
  });

  it("a created run id is readable by any other store instance at once, with its owner as evidence", async () => {
    expect(workspaceStore().kind).toBe("postgres");
    const { id } = await ensureSession(randomBytes(32).toString("hex"));
    const created = await createAskRun(id, "cardiology", "Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?");
    expect(created.run.status).toBe("queued");
    // A fresh store object stands in for another server instance: nothing is shared but the database.
    const other = new PostgresWorkspaceStore();
    expect(await other.getRun(id, created.run.id)).toMatchObject({ id: created.run.id, status: "queued" });
    expect(await other.findRunSession(created.run.id)).toBe(id);
    expect((await lookupRun(id, "cardiology", created.run.id)).availability).toBe("available");
    expect((await lookupRun(randomBytes(32).toString("hex"), "cardiology", created.run.id)).availability).toBe("session_mismatch");
    expect((await lookupRun(id, "cardiology", "run-00000000-0000-4000-8000-000000000000")).availability).toBe("run_not_found");

    // A run whose execution was lost is reported as expired, durably.
    const expired = await settleExpiredRun(id, created.run, new Date(Date.parse(created.run.progress!.deadlineAt) + 1_000));
    expect(expired.error).toBe("execution_expired");
    expect((await other.getRun(id, created.run.id))?.error).toBe("execution_expired");
  });

  afterAll(async () => { await pool?.end(); });
});
