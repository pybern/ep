// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderCompatibility } from "./provider-compatibility";
import type { ApiSettings } from "@/lib/connections";

const base: ApiSettings = { baseUrl: "https://llm.example/v1", model: "m" };
let container: HTMLDivElement;
let root: Root;
const onChange = vi.fn();
const onError = vi.fn();

async function mount(api: ApiSettings) {
  await act(async () => { root.render(createElement(ProviderCompatibility, { api, onChange, onError })); });
}
async function type(label: string, value: string) {
  await act(async () => {
    const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(label: string, value: string) {
  await act(async () => {
    const element = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function open() {
  await act(async () => {
    const details = container.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
  });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  onChange.mockReset();
  onError.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("provider compatibility fields", () => {
  it("stays unmounted until opened, but opens when settings are already customised", async () => {
    await mount(base);
    expect(container.querySelector('[aria-label="Structured output"]')).toBeNull();
    await open();
    expect(container.querySelector('[aria-label="Structured output"]')).not.toBeNull();
    await act(async () => { root.unmount(); root = createRoot(container); });
    await mount({ ...base, structuredOutput: "prompt" });
    expect(container.textContent).toContain("customised");
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Structured output"]')!.value).toBe("prompt");
  });

  it("fills the fields from an example", async () => {
    await mount(base);
    await open();
    await choose("Compatibility example", "azure");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxTokensParam: "max_completion_tokens", dropParams: ["temperature"] }));
    expect(container.querySelector<HTMLInputElement>('[aria-label="Parameters to drop"]')!.value).toBe("temperature");
  });

  it("reports invalid extra-parameter JSON and applies only valid objects", async () => {
    await mount(base);
    await open();
    await type("Extra request parameters", '{"a":');
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("valid JSON object"));
    expect(onChange).not.toHaveBeenCalled();
    await type("Extra request parameters", '{"top_k": 5}');
    expect(onError).toHaveBeenLastCalledWith("");
    expect(onChange).toHaveBeenLastCalledWith({ extraBody: { top_k: 5 } });
    await type("Extra request parameters", "[1]");
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("valid JSON object"));
  });

  it("edits headers, keeps saved values as unchanged placeholders and removes them", async () => {
    await mount({ ...base, requestHeaders: { "api-key": null } });
    expect(container.querySelector<HTMLInputElement>('[aria-label="Header 1 value"]')!.placeholder).toBe("Saved value (unchanged)");
    await type("Header 1 value", "new-secret");
    expect(onChange).toHaveBeenLastCalledWith({ requestHeaders: { "api-key": "new-secret" } });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Add header")!.click(); });
    await type("Header 2 name", "X-Tenant");
    await type("Header 2 value", "acme");
    expect(onChange).toHaveBeenLastCalledWith({ requestHeaders: { "api-key": "new-secret", "X-Tenant": "acme" } });
    await act(async () => { [...container.querySelectorAll("button")].filter((button) => button.textContent === "Remove")[0].click(); });
    expect(onChange).toHaveBeenLastCalledWith({ requestHeaders: { "X-Tenant": "acme" } });
  });

  it("turns streaming off and lists non-default settings as LLM_* lines without secret values", async () => {
    await mount({ ...base, requestHeaders: { "api-key": null }, streaming: false, structuredOutput: "json_object" });
    expect(container.querySelector<HTMLInputElement>('[aria-label="Stream responses"]')!.checked).toBe(false);
    const lines = container.querySelector('[aria-label="Environment variable equivalent"]')!.textContent!;
    expect(lines).toContain('LLM_STREAMING="false"');
    expect(lines).toContain('LLM_STRUCTURED_OUTPUT="json_object"');
    expect(lines).toContain('"api-key"');
  });
});
