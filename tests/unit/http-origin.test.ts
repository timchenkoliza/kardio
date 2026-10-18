import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { assertSameOrigin, HttpError } from "@/server/http";

function request(origin: string, host: string, url = "http://localhost:3000/api/state") {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      origin,
      host,
      "content-type": "application/json",
    },
    body: "{}",
  });
}

describe("same-origin validation", () => {
  it("accepts the browser origin that matches the Host header even if nextUrl uses a loopback alias", () => {
    expect(() => assertSameOrigin(request("http://127.0.0.1:3000", "127.0.0.1:3000"))).not.toThrow();
  });

  it("rejects a different origin", () => {
    expect(() => assertSameOrigin(request("http://evil.example", "127.0.0.1:3000"))).toThrow(HttpError);
  });
});
