import { deflateRawSync, crc32 } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { computeAgentMetrics } from "@/lib/agents/metrics";
import { defaultProfile } from "@/lib/agents/profile";
import { executeAgentCommand } from "@/server/agents/commands";
import { docxToText, materialFromNote, parseUpload, searchUserMaterials } from "@/server/agents/services/material";
import { workspaceStore } from "@/server/agents/store";
import { resetMemorySession } from "@/server/agents/store/memory";
import { decodeProfileMirror, encodeProfileMirror } from "@/server/agents/store/mirror";

const SESSION = "d".repeat(64);
const OTHER = "e".repeat(64);

function zip(name: string, content: string, deflate = true): Buffer {
  const data = Buffer.from(content, "utf8");
  const body = deflate ? deflateRawSync(data) : data;
  const nameBytes = Buffer.from(name, "utf8");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + body.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + nameBytes.length, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBytes, body, central, nameBytes, end]);
}

const DOCX_XML = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Шкала SCORE2</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">для 40–69 лет &amp; SCORE2-OP</w:t></w:r></w:p></w:body></w:document>`;

beforeEach(() => { resetMemorySession(SESSION); resetMemorySession(OTHER); });

describe("my materials: upload → parse → index → personal retrieval", () => {
  it("extracts DOCX text from deflated and stored archives", () => {
    expect(docxToText(zip("word/document.xml", DOCX_XML))).toBe("Шкала SCORE2\nдля 40–69 лет & SCORE2-OP");
    expect(docxToText(zip("word/document.xml", DOCX_XML, false))).toContain("SCORE2-OP");
  });

  it("parses text formats, de-identifies them and is honest about PDF", () => {
    const parsed = parseUpload("note.txt", "text/plain", Buffer.from("Пациент Петров, email a@b.ru. ХСН и иНГЛТ-2"));
    expect(parsed.parseStatus).toBe("indexed");
    expect(parsed.text).not.toContain("Петров");
    expect(parsed.text).not.toContain("a@b.ru");
    expect(parseUpload("guideline.pdf", "application/pdf", Buffer.from("%PDF-1.7")).parseStatus).toBe("parser_unavailable");
    expect(parseUpload("scan.dcm", "application/dicom", Buffer.from("x")).parseStatus).toBe("rejected");
    expect(parseUpload("page.html", "text/html", Buffer.from("<h1>Лёгочная гипертензия</h1><script>x()</script>")).text).toBe("Лёгочная гипертензия");
  });

  it("retrieves only from the requesting user's materials", async () => {
    const store = workspaceStore();
    await store.saveMaterial(SESSION, materialFromNote({ specialty: "cardiology", title: "SCORE2 разбор", note: "Шкала SCORE2 для 40–69 лет", now: "2026-10-19T00:00:00.000Z" }));
    await store.saveMaterial(OTHER, materialFromNote({ specialty: "cardiology", title: "Чужая заметка SCORE2", note: "Шкала SCORE2 чужая", now: "2026-10-19T00:00:00.000Z" }));
    const mine = await store.listMaterials(SESSION, "cardiology");
    expect(searchUserMaterials(mine, "шкала SCORE2").map(hit => hit.material.title)).toEqual(["SCORE2 разбор"]);

    const result = await executeAgentCommand(SESSION, { action: "runTask", specialty: "cardiology", text: "что в моих материалах про шкалу SCORE2", agentId: "materials" });
    const run = await store.getRun(SESSION, result.runId!);
    const results = await store.listResults(SESSION, "cardiology", "materials");
    expect(run?.agentId).toBe("materials");
    expect(results.filter(item => run?.resultIds.includes(item.id)).map(item => item.title)).toEqual(["SCORE2 разбор"]);
    expect(results.every(item => item.source.ownership === "USER_UPLOADED")).toBe(true);
  });

  it("saves an agent result with its provenance as GENERATED material", async () => {
    await executeAgentCommand(SESSION, { action: "setInterests", specialty: "cardiology", topics: ["ah"], trustedSources: ["rko"], excludedSources: [], runAgents: false });
    const run = await executeAgentCommand(SESSION, { action: "runAgent", specialty: "cardiology", agentId: "drugs" });
    const store = workspaceStore();
    const latest = await store.getRun(SESSION, run.runId!);
    const target = (await store.listResults(SESSION, "cardiology", "drugs")).find(result => latest?.resultIds.includes(result.id) && !result.partner);
    expect(target).toBeDefined();
    const saved = await executeAgentCommand(SESSION, { action: "saveResult", specialty: "cardiology", resultId: target!.id });
    expect(saved.material?.ownership).toBe("GENERATED");
    expect(saved.material?.provenance?.sourceUrl).toBe(target!.source.sourceUrl);
    expect((await store.getResult(SESSION, target!.id))?.savedMaterialId).toBe(saved.material?.id);
  });
});

describe("commands: configuration, since-last-visit and confirmation", () => {
  it("re-runs monitoring agents on interest change and resets counters after viewing", async () => {
    const result = await executeAgentCommand(SESSION, { action: "setInterests", specialty: "cardiology", topics: ["hf", "ah"], trustedSources: ["rko", "esc"], excludedSources: [], runAgents: true });
    expect(result.ran).toEqual(["whats_new", "guidelines", "drugs", "events", "learning"]);
    const { getWorkspaceView } = await import("@/server/agents/workspace");
    const before = await getWorkspaceView(SESSION, "cardiology");
    expect(before.configured).toBe(true);
    const drugs = before.cards.find(card => card.agentId === "drugs")!;
    expect(drugs.newResults).toBeGreaterThan(0);
    await new Promise(resolve => setTimeout(resolve, 5));
    await executeAgentCommand(SESSION, { action: "markSeen", specialty: "cardiology", agentId: "drugs" });
    const after = await getWorkspaceView(SESSION, "cardiology");
    expect(after.cards.find(card => card.agentId === "drugs")!.newResults).toBe(0);
    expect(after.cards.find(card => card.agentId === "research")!.newResults).toBe(0);
  });

  it("prepares and confirms a registration hand-off without claiming registration", async () => {
    await executeAgentCommand(SESSION, { action: "setInterests", specialty: "cardiology", topics: ["hf"], trustedSources: ["rko"], excludedSources: [], runAgents: false });
    await executeAgentCommand(SESSION, { action: "runAgent", specialty: "cardiology", agentId: "events" });
    const event = (await workspaceStore().listResults(SESSION, "cardiology", "events")).find(result => result.kind === "event");
    expect(event).toBeDefined();
    const prepared = await executeAgentCommand(SESSION, { action: "prepareAction", specialty: "cardiology", kind: "registration", resultIds: [event!.id] });
    expect(prepared.action?.status).toBe("pending_confirmation");
    expect(prepared.action?.integration.mode).toBe("UNAVAILABLE");
    const confirmed = await executeAgentCommand(SESSION, { action: "confirmAction", specialty: "cardiology", actionId: prepared.action!.id });
    expect(confirmed.action?.status).toBe("handed_off");
    expect(confirmed.action?.artifactUrl).toBe(event!.attributes.registrationUrl);
    await expect(executeAgentCommand(SESSION, { action: "confirmAction", specialty: "cardiology", actionId: prepared.action!.id })).rejects.toThrow("уже обработано");
  });
});

describe("profile mirror for deployments without a database", () => {
  it("round-trips settings and last-seen marks within the cookie budget", () => {
    const profile = defaultProfile("cardiology", "2026-10-19T00:00:00.000Z");
    profile.interests.topics = ["hf", "ah", "af", "lipids", "valves", "cardiomyopathy", "ph", "metabolic"];
    profile.subscriptions.drugs.lastSeenAt = "2026-10-18T10:00:00.000Z";
    profile.preferences.events.formats = ["moscow", "online"];
    const encoded = encodeProfileMirror(profile);
    expect(encoded.length).toBeGreaterThan(0);
    expect(encoded.length).toBeLessThan(3600);
    const decoded = decodeProfileMirror(encoded, "cardiology")!;
    expect(decoded.interests.topics).toEqual(profile.interests.topics);
    expect(decoded.subscriptions.drugs.lastSeenAt).toBe("2026-10-18T10:00:00.000Z");
    expect(decoded.preferences.events.formats).toEqual(["moscow", "online"]);
    expect(decodeProfileMirror("not-base64!", "cardiology")).toBeNull();
  });
});

describe("agent product metrics", () => {
  it("measures delegated work, not page views", () => {
    const at = (day: number) => new Date(Date.UTC(2026, 9, day)).toISOString();
    const metrics = computeAgentMetrics([
      { event: "agent_run_started", sessionId: "s1", createdAt: at(1), payload: { agentId: "drugs" } },
      { event: "agent_run_completed", sessionId: "s1", createdAt: at(1), payload: { agentId: "drugs", status: "completed", count: 3 } },
      { event: "agent_run_started", sessionId: "s1", createdAt: at(4), payload: { agentId: "drugs" } },
      { event: "agent_run_completed", sessionId: "s1", createdAt: at(4), payload: { agentId: "drugs", status: "partial", count: 1 } },
      { event: "agent_run_started", sessionId: "s2", createdAt: at(2), payload: { agentId: "events" } },
      { event: "agent_run_completed", sessionId: "s2", createdAt: at(2), payload: { agentId: "events", status: "failed", count: 0 } },
      { event: "agent_result_opened", sessionId: "s1", createdAt: at(1), payload: {} },
      { event: "agent_result_opened", sessionId: "s1", createdAt: at(1), payload: {} },
      { event: "evidence_opened", sessionId: "s1", createdAt: at(1), payload: {} },
      { event: "material_saved", sessionId: "s1", createdAt: at(1), payload: {} },
      { event: "action_started", sessionId: "s1", createdAt: at(1), payload: { actionKind: "calendar_write" } },
      { event: "action_completed", sessionId: "s1", createdAt: at(1), payload: { status: "completed" } },
    ]);
    expect(metrics.taskCompletionRate).toBe(0.667);
    expect(metrics.evidenceCtr).toBe(0.5);
    expect(metrics.saveRate).toBe(0.5);
    expect(metrics.usefulActionRate).toBe(1.5);
    expect(metrics.repeatAgentUsage).toBe(1);
    expect(metrics.sevenDayAgentRetention).toBe(1);
    expect(metrics.successfulExternalActionRate).toBe(1);
    expect(metrics.estimatedMinutesSaved).toBe(20);
  });
});
