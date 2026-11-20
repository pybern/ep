"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiSettings } from "@/lib/connections";
import { MAX_OUTPUT_TOKENS } from "@/lib/connections";
import { sendModelChat } from "@/lib/model-chat-stream";
import { MAX_TEST_IMAGE_BYTES, modelTestBody, TEST_IMAGE_TYPES, type ModelTestRequest } from "@/lib/model-tester";
import { applyProviderOverrides } from "@/lib/provider-request";

const inputClass = "mt-2 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white";
const buttonClass = "min-h-10 border border-slate-600 px-4 text-sm text-slate-200 hover:border-sky-400 disabled:opacity-50";

export function ModelRequestBuilder({ token, settings, disabled }: { token: string; settings: ApiSettings; disabled: boolean }) {
  const [request, setRequest] = useState<ModelTestRequest>({ prompt: "Describe this image.", maxTokens: 512, stream: false, mode: "chat" });
  const [imageName, setImageName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [completion, setCompletion] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const uploadRevision = useRef(0);
  useEffect(() => () => { controller.current?.abort(); uploadRevision.current++; }, []);

  function update(change: Partial<ModelTestRequest>) {
    setRequest((current) => ({ ...current, ...change }));
    setError("");
    setCompletion("");
  }

  async function attach(file?: File) {
    const revision = ++uploadRevision.current;
    update({ image: undefined });
    setImageName("");
    if (!file) return;
    if (!TEST_IMAGE_TYPES.some((type) => type === file.type) || !file.size || file.size > MAX_TEST_IMAGE_BYTES) {
      setError("Choose a PNG, JPEG, WebP or GIF image of at most 2 MB.");
      return;
    }
    setUploading(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode the image."));
        reader.onerror = () => reject(new Error("Could not read the image. Choose the file again."));
        reader.readAsDataURL(file);
      });
      if (revision !== uploadRevision.current) return;
      update({ image });
      setImageName(file.name);
    } catch (error) {
      if (revision === uploadRevision.current) setError(error instanceof Error ? error.message : "Could not read the image.");
    } finally {
      if (revision === uploadRevision.current) setUploading(false);
    }
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    if (controller.current || uploading) return;
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    setError("");
    setText("");
    setReasoning("");
    setCompletion("");
    try {
      const result = await sendModelChat(token, [], active.signal, setText, setReasoning, {
        api: "/api/config/request", settings, request,
      });
      if (!active.signal.aborted) setCompletion(`Completed in ${result.durationMs} ms${request.mode === "json" ? "; strict JSON schema verified" : ""}.`);
    } catch (error) {
      if (!active.signal.aborted) setError(error instanceof Error ? error.message : "The model request failed.");
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setPending(false);
      }
    }
  }

  function cancel() {
    controller.current?.abort();
    setError("Request cancelled. Any displayed output is incomplete.");
  }

  const preview = previewOpen ? modelTestBody(settings.model, {
    ...request, ...(request.image ? { image: `data:${request.image.slice(5, request.image.indexOf(";"))};base64,<image payload omitted from preview>` } : {}),
  }) : undefined;

  return <section className="border border-slate-700 bg-slate-950 p-5 md:p-6" aria-labelledby="model-request-title">
    <h2 id="model-request-title" className="text-xl font-semibold text-white">Model request builder</h2>
    <p className="mt-2 text-sm text-slate-400">Tests the provider settings above, including unsaved changes. Save the provider to apply it to chats. Test prompts, images and request controls are not saved.</p>
    <form onSubmit={run} className="mt-5">
      <fieldset disabled={disabled || pending || uploading} className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm text-slate-300 sm:col-span-2">Text prompt
          <textarea aria-label="Test prompt" className={inputClass} rows={3} maxLength={16000} value={request.prompt} onChange={(event) => update({ prompt: event.target.value })} />
        </label>
        <label className="text-sm text-slate-300 sm:col-span-2">System prompt (optional)
          <textarea aria-label="Test system prompt" className={inputClass} rows={2} maxLength={16000} value={request.systemPrompt ?? ""} onChange={(event) => update({ systemPrompt: event.target.value })} />
        </label>
        <label className="text-sm text-slate-300">Maximum output tokens (max_tokens)
          <input aria-label="Test max_tokens" className={inputClass} type="number" min={1} max={MAX_OUTPUT_TOKENS} step={1} required value={request.maxTokens} onChange={(event) => update({ maxTokens: Number(event.target.value) })} />
        </label>
        <label className="text-sm text-slate-300">Temperature (optional, 0-2)
          <input aria-label="Test temperature" className={inputClass} type="number" min={0} max={2} step="any" value={request.temperature ?? ""} onChange={(event) => update({ temperature: event.target.value === "" ? undefined : Number(event.target.value) })} />
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-300 sm:col-span-2">
          <input aria-label="Test stream" type="checkbox" checked={request.stream} onChange={(event) => update({ stream: event.target.checked })} className="size-4 accent-sky-500" />
          Streaming (stream). Off sends a non-streaming request; on displays arriving tokens.
        </label>
        <label className="flex items-center gap-3 text-sm text-slate-300 sm:col-span-2">
          <input aria-label="Test strict JSON schema" type="checkbox" checked={request.mode === "json"} onChange={(event) => update({ mode: event.target.checked ? "json" : "chat" })} className="size-4 accent-sky-500" />
          Require strict JSON-schema output instead of basic chat
        </label>
        {request.mode === "json" && <p className="text-xs text-slate-400 sm:col-span-2">The response must match {`{"ok":true,"feedback":"..."}`}. Include that instruction in your prompt. A basic chat response does not establish research compatibility.</p>}
        <label className="text-sm text-slate-300 sm:col-span-2">Image (optional, up to 2 MB)
          <input aria-label="Test image" type="file" accept={TEST_IMAGE_TYPES.join(",")} className={inputClass} onChange={(event) => { void attach(event.target.files?.[0]); event.target.value = ""; }} />
          <span className="mt-2 block text-xs text-slate-500">PNG, JPEG, WebP or GIF. Sent as a base64 image_url; the selected model must support vision. An image-only request can have an empty text prompt.</span>
        </label>
        {imageName && <div className="text-sm text-slate-300 sm:col-span-2">
          {imageName} <button type="button" className="ml-3 underline" onClick={() => { void attach(); }}>Remove image</button>
        </div>}
        <div className="sm:col-span-2">
          <button type="submit" className={buttonClass} disabled={!settings.model.trim() || (!request.prompt.trim() && !request.image)}>{uploading ? "Reading image..." : pending ? "Running request..." : "Run model request"}</button>
          <p className="mt-2 text-xs text-slate-500">May incur provider charges. 60-second server timeout. No automatic retries.</p>
        </div>
      </fieldset>
      {pending && <button type="button" className={`${buttonClass} mt-3`} onClick={cancel}>Cancel request</button>}
    </form>
    <details className="mt-5 text-xs text-slate-400" onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer">Request body preview (credentials excluded, Provider compatibility applied)</summary>
      {preview && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(applyProviderOverrides({
        ...preview, ...(settings.reasoningEffort ? { reasoning_effort: settings.reasoningEffort } : {}),
      }, settings), null, 2)}</pre>}
    </details>
    <div aria-live="polite">
      {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
      {completion && <p className="mt-4 text-sm text-emerald-300">{completion}</p>}
    </div>
    {reasoning && <details className="mt-4 text-xs text-slate-400"><summary>Thinking</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words">{reasoning}</pre></details>}
    {text && <pre aria-label="Model request output" className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200">{text}</pre>}
  </section>;
}
