// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelRequestBuilder } from "./model-request-builder";
import { sendModelChat } from "@/lib/model-chat-stream";

vi.mock("@/lib/model-chat-stream", () => ({ sendModelChat: vi.fn() }));

const settings = { baseUrl: "https://internal.example/v1", model: "custom-vision-model", apiKey: "", verifySsl: false };
let container: HTMLDivElement;
let root: Root;

async function edit(label: string, value: string) {
  await act(async () => {
    const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function run() {
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(sendModelChat).mockReset();
  vi.mocked(sendModelChat).mockImplementation(async (_token, _messages, _signal, onText) => {
    onText("A test reply.");
    return { message: { role: "assistant", content: "A test reply." }, model: settings.model, baseUrl: settings.baseUrl, durationMs: 20 };
  });
  container = document.createElement("div");
  document.body.append(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ModelRequestBuilder, { settings, token: "admin-token", disabled: false }));
  });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("model request builder", () => {
  it("sends current form settings and editable generation controls without saving them", async () => {
    await edit("Test prompt", "Hello model");
    await edit("Test system prompt", "Be concise.");
    await edit("Test max_tokens", "700");
    await edit("Test temperature", "0.5");
    await run();
    expect(sendModelChat).toHaveBeenCalledWith(
      "admin-token", [], expect.any(AbortSignal), expect.any(Function), expect.any(Function),
      { api: "/api/config/request", settings, request: {
        prompt: "Hello model", systemPrompt: "Be concise.", maxTokens: 700, temperature: 0.5, stream: false, mode: "chat",
      } },
    );
    expect(container.textContent).toContain("Completed in 20 ms");
    expect(container.querySelector('[aria-label="Model request output"]')?.textContent).toBe("A test reply.");
  });

  it("offers streaming and strict JSON output independently", async () => {
    await act(async () => {
      container.querySelector<HTMLInputElement>('[aria-label="Test stream"]')!.click();
      container.querySelector<HTMLInputElement>('[aria-label="Test strict JSON schema"]')!.click();
    });
    await run();
    expect(vi.mocked(sendModelChat).mock.calls[0][5]).toMatchObject({
      request: { maxTokens: 512, stream: true, mode: "json" },
    });
  });

  it("encodes images and permits an empty text prompt, then removes the attachment", async () => {
    vi.stubGlobal("FileReader", class {
      result: string | null = null;
      onload?: () => void;
      readAsDataURL(file: File) { this.result = `data:${file.type};base64,aGVsbG8=`; this.onload?.(); }
    });
    await act(async () => {
      const input = container.querySelector<HTMLInputElement>('[aria-label="Test image"]')!;
      Object.defineProperty(input, "files", { configurable: true, value: [new File(["hello"], "example.png", { type: "image/png" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await edit("Test prompt", "");
    await run();
    expect(vi.mocked(sendModelChat).mock.calls[0][5]).toMatchObject({
      request: { prompt: "", image: "data:image/png;base64,aGVsbG8=" },
    });
    await act(async () => { [...container.querySelectorAll("button")].find((button) => button.textContent === "Remove image")!.click(); });
    expect(container.textContent).not.toContain("example.png");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await edit("Test prompt", "Now answer without an image.");
    await run();
    expect(vi.mocked(sendModelChat).mock.calls.at(-1)?.[5]).toMatchObject({
      request: { prompt: "Now answer without an image.", image: undefined },
    });
  });

  it("reports failed requests without a completion indicator", async () => {
    vi.mocked(sendModelChat).mockRejectedValueOnce(new Error("API returned HTTP 503."));
    await run();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("API returned HTTP 503.");
    expect(container.textContent).not.toContain("Completed in");
  });
});
