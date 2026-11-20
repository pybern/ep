import { describe, expect, it } from "vitest";
import { describeWireResponse, networkErrorHint } from "./wire-summary";

const describe_ = (status: number, body: string, contentType = "application/json", extra: { truncated?: boolean; location?: string } = {}) =>
  describeWireResponse({ status, contentType, body, truncated: false, ...extra }).join("\n");

describe("describeWireResponse", () => {
  it("surfaces the provider's error message with guidance for the status", () => {
    const text = describe_(422, JSON.stringify({ detail: "Extra inputs are not permitted: top_k" }));
    expect(text).toContain("rejected the request body");
    expect(text).toContain("Provider error message: Extra inputs are not permitted: top_k");
    expect(describe_(401, "{}")).toContain("Access was rejected");
  });

  it("flags HTML, empty and non-JSON bodies", () => {
    expect(describe_(200, "<!DOCTYPE html><html>", "text/html")).toContain("HTML, not an API reply");
    expect(describe_(200, "")).toContain("body is empty");
    expect(describe_(200, "plain words", "text/plain")).toContain("not valid JSON");
  });

  it("describes a chat completion, including empty content and thinking in an unread field", () => {
    const text = describe_(200, JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: null, reasoning_details: [{}] } }], usage: { total_tokens: 9 },
    }));
    expect(text).toContain("message.content is empty or null");
    expect(text).toContain("reasoning_details, which the app does not read");
    expect(text).toContain("total_tokens 9");
  });

  it("describes streams: delta fields, missing finish and missing [DONE]", () => {
    const events = [{ choices: [{ delta: { role: "assistant", content: "", reasoning: "hm" } }] }, { choices: [{ delta: { content: "ok" } }] }];
    const text = describe_(200, events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), "text/event-stream");
    expect(text).toContain("2 data events, no [DONE] seen");
    expect(text).toContain("Delta fields seen: role, reasoning, content");
    expect(text).toContain("No finish_reason chunk seen");
  });

  it("reports redirects and cut-off output", () => {
    expect(describe_(302, "", "text/plain", { location: "/login" })).toContain("Redirect to /login");
    expect(describe_(200, '{"choices":[', "application/json", { truncated: true })).toContain("cut off");
  });
});

describe("networkErrorHint", () => {
  it("maps TLS, DNS and timeout failures to actions", () => {
    expect(networkErrorHint("SELF_SIGNED_CERT_IN_CHAIN")).toContain("CA certificate");
    expect(networkErrorHint("ENOTFOUND")).toContain("proxy");
    expect(networkErrorHint(undefined, "TimeoutError")).toContain("did not finish in time");
    expect(networkErrorHint("SOMETHING_ELSE")).toBeUndefined();
  });
});
