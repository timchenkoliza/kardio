import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("one anonymous session per browser, assigned before any API call", () => {
  it("assigns a well-formed session id on the first page request, visible to that render and to later requests", () => {
    const response = proxy(new NextRequest("http://127.0.0.1:3000/cardiology", { headers: { cookie: "other=1" } }));
    const set = response.cookies.get("kardio_session");
    expect(set?.value).toMatch(/^[a-f0-9]{64}$/u);
    expect(set?.httpOnly).toBe(true);
    // The rewritten request (what this render sees) carries the same id and keeps other cookies.
    const forwarded = response.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwarded).toContain(`kardio_session=${set!.value}`);
    expect(forwarded).toContain("other=1");
  });

  it("never replaces an existing session", () => {
    const id = "c".repeat(64);
    const response = proxy(new NextRequest("http://127.0.0.1:3000/cardiology/ask?run=x", { headers: { cookie: `kardio_session=${id}` } }));
    expect(response.cookies.get("kardio_session")).toBeUndefined();
  });

  it("replaces a malformed value instead of keeping it", () => {
    const response = proxy(new NextRequest("http://127.0.0.1:3000/cardiology", { headers: { cookie: "kardio_session=not-a-session" } }));
    expect(response.cookies.get("kardio_session")?.value).toMatch(/^[a-f0-9]{64}$/u);
  });
});
