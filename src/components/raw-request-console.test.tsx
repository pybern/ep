// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RawRequestConsole } from "./raw-request-console";
import type { RawExchange } from "@/lib/wire-summary";

const settings = { baseUrl: "https://llm.example/v1", model: "custom-model", structuredOutput: "prompt" as const };
let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

const exchange = (patch: Partial<RawExchange> = {}): RawExchange => ({
  request: { method: "POST", url: "https://llm.example/v1/chat/completions", headers: { authorization: "[redacted]" }, bodyBytes: 10 },
  response: { status: 400, statusText: "Bad Request", headers: { "content-type": "application/json" }, body: '{"error":{"message":"nope"}}', bodyBytes: 27, truncated: false, timeToFirstByteMs: 12 },
  durationMs: 40, observations: ["The provider rejected the request body."], ...patch,
});
async function change(label: string, value: string) {
  await act(async () => {
    const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function press(text: string) {
  await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === text)!.click(); });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(RawRequestConsole, { token: "admin-token", settings, disabled: false }));
  });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("raw request console", () => {
  it("starts from the app's own probe with the current compatibility settings applied", () => {
    const body = JSON.parse(container.querySelector<HTMLTextAreaElement>('[aria-label="Raw body"]')!.value);
    expect(body).toMatchObject({ model: "custom-model", max_tokens: 4096 });
    expect(body).not.toHaveProperty("response_format");
    expect(body.messages[0].content).toContain("JSON schema");
  });

  it("loads samples, including body-less GET requests", async () => {
    await change("Raw sample", "models");
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Raw method"]')!.value).toBe("GET");
    expect(container.querySelector<HTMLInputElement>('[aria-label="Raw path"]')!.value).toBe("/models");
    expect(container.querySelector('[aria-label="Raw body"]')).toBeNull();
    await change("Raw sample", "stream");
    expect(JSON.parse(container.querySelector<HTMLTextAreaElement>('[aria-label="Raw body"]')!.value)).toMatchObject({ model: "custom-model", stream: true });
  });

  it("sends the editable MaaS Python payload without adding probe parameters", async () => {
    await change("Raw sample", "maas-qwen");
    const body = JSON.parse(container.querySelector<HTMLTextAreaElement>('[aria-label="Raw body"]')!.value);
    expect(body).toEqual({
      model: "Qwen3.6-35B-A3B-AWQ",
      messages: [{ role: "user", content: "You good in SQL?" }, { role: "user", content: "rararar?" }],
      reasoning_effort: "high",
    });
    const edited = JSON.stringify({ ...body, reasoning_effort: "low" });
    await change("Raw body", edited);
    fetchMock.mockResolvedValue(new Response(JSON.stringify(exchange()), { status: 200 }));
    await press("Send raw request");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).request).toEqual({
      method: "POST", path: "/chat/completions", body: edited,
    });
  });

  it("sends the edited text untouched with the unsaved settings and shows the raw answer and its meaning", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(exchange()), { status: 200 }));
    await change("Raw body", "{not json");
    expect(container.textContent).toContain("Not valid JSON");
    await press("Send raw request");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/config/raw");
    expect(init.headers.Authorization).toBe("Bearer admin-token");
    expect(JSON.parse(init.body)).toEqual({ settings, request: { method: "POST", path: "/chat/completions", body: "{not json" } });
    expect(container.textContent).toContain("HTTP 400 Bad Request");
    expect(container.querySelector('[aria-label="What this means"]')!.textContent).toContain("rejected the request body");
    expect(container.querySelector('[aria-label="Raw response body"]')!.textContent).toContain('"message": "nope"');
  });

  it("shows connection failures with their code and hint", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(exchange({ response: undefined, error: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND llm.example", hint: "The hostname could not be resolved." } })), { status: 200 }));
    await press("Send raw request");
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("ENOTFOUND");
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("hostname could not be resolved");
  });

  it("surfaces server errors and copies a report", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid administrator token." }), { status: 401 }));
    await press("Send raw request");
    expect(container.textContent).toContain("Invalid administrator token.");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(exchange()), { status: 200 }));
    await press("Send raw request");
    await press("Copy report");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("HTTP 400 Bad Request"));
    expect(writeText.mock.calls[0][0]).toContain("## Request body");
  });
});
