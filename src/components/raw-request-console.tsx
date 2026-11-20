"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiSettings } from "@/lib/connections";
import { rawSamples } from "@/lib/provider-samples";
import { formatRawReport, MAX_RAW_BODY_CHARS, type RawExchange } from "@/lib/wire-summary";

const inputClass = "mt-2 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500";
const buttonClass = "min-h-10 border border-slate-600 px-4 text-sm text-slate-200 hover:border-sky-400 disabled:opacity-50";

function pretty(text: string): string {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

/**
 * Sends one request exactly as typed to the configured provider and shows the raw answer, so a provider that
 * rejects the app's requests can be diagnosed from the browser. Uses the unsaved settings above, including headers.
 */
export function RawRequestConsole({ token, settings, disabled }: { token: string; settings: ApiSettings; disabled: boolean }) {
  const samples = useMemo(() => rawSamples(settings), [settings]);
  const [sampleId, setSampleId] = useState("app-probe");
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [path, setPath] = useState("/chat/completions");
  const [body, setBody] = useState(() => JSON.stringify(samples[0].body, null, 2));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [exchange, setExchange] = useState<RawExchange>();
  const [sentBody, setSentBody] = useState("");
  const [prettyJson, setPrettyJson] = useState(true);
  const [copied, setCopied] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const sample = samples.find((item) => item.id === sampleId);
  const bodyIsJson = (() => { try { JSON.parse(body); return true; } catch { return false; } })();

  function load(id: string) {
    const next = samples.find((item) => item.id === id);
    if (!next) return;
    setSampleId(id);
    setMethod(next.method);
    setPath(next.path);
    setBody(next.body ? JSON.stringify(next.body, null, 2) : "");
    setError("");
  }

  async function send() {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setPending(true);
    setError("");
    setExchange(undefined);
    setCopied("");
    const requestBody = method === "POST" ? body : "";
    setSentBody(requestBody);
    try {
      const response = await fetch("/api/config/raw", {
        method: "POST", cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ settings, request: { method, path, ...(method === "POST" ? { body: requestBody } : {}) } }),
        signal: AbortSignal.any([active.signal, AbortSignal.timeout(75000)]),
      });
      let result: unknown;
      try { result = await response.json(); } catch { throw new Error(`Server returned HTTP ${response.status} without a JSON response.`); }
      if (!response.ok) throw new Error(typeof (result as { error?: unknown }).error === "string" ? (result as { error: string }).error : `Request failed (HTTP ${response.status}).`);
      if (!active.signal.aborted) setExchange(result as RawExchange);
    } catch (caught) {
      if (!active.signal.aborted) setError(caught instanceof Error ? caught.message : "The raw request failed.");
    } finally {
      if (controller.current === active) { controller.current = null; setPending(false); }
    }
  }

  async function copyReport() {
    if (!exchange) return;
    try {
      await navigator.clipboard.writeText(formatRawReport(exchange, sentBody));
      setCopied("Report copied.");
    } catch { setCopied("Copy is blocked in this browser. Select the output instead."); }
  }

  const response = exchange?.response;
  const isJsonResponse = Boolean(response && !response.truncated && !/^\s*(data|event):/.test(response.body));
  return (
    <section className="border border-slate-700 bg-slate-950 p-5 md:p-6" aria-labelledby="raw-request-title">
      <h2 id="raw-request-title" className="text-xl font-semibold text-white">Raw request console</h2>
      <p className="mt-2 text-sm text-slate-400">
        Sends the request below exactly as written to the API base URL, with the unsaved provider settings above (credentials and custom headers are added by the server).
        You see the provider&apos;s unprocessed status, headers and body, plus what they mean. Use it to find a payload the provider accepts, then copy the difference into Provider compatibility.
      </p>
      <fieldset disabled={disabled || pending} className="mt-5 grid gap-5 sm:grid-cols-[8rem_1fr]">
        <label className="text-sm text-slate-300 sm:col-span-2">Sample request
          <select aria-label="Raw sample" className={inputClass} value={sampleId} onChange={(event) => load(event.target.value)}>
            {samples.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {sample && <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{sample.description}</span>}
        </label>
        <label className="text-sm text-slate-300">Method
          <select aria-label="Raw method" className={inputClass} value={method} onChange={(event) => setMethod(event.target.value === "GET" ? "GET" : "POST")}>
            <option>POST</option>
            <option>GET</option>
          </select>
        </label>
        <label className="min-w-0 text-sm text-slate-300">Path, appended to {settings.baseUrl || "the API base URL"}
          <input aria-label="Raw path" className={`${inputClass} font-mono`} value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} placeholder="/chat/completions" />
          <span className="mt-1.5 block text-xs text-slate-500">A query string is allowed, for example /chat/completions?api-version=2024-06-01.</span>
        </label>
        {method === "POST" && <label className="text-sm text-slate-300 sm:col-span-2">Request body
          <textarea aria-label="Raw body" className={`${inputClass} font-mono text-xs`} rows={14} value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} maxLength={MAX_RAW_BODY_CHARS} />
          <span className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{bodyIsJson ? "Valid JSON." : "Not valid JSON. It is sent as written, which is useful for testing the provider's error."}</span>
            {bodyIsJson && <button type="button" className="underline hover:text-white" onClick={() => setBody(pretty(body))}>Format</button>}
            <button type="button" className="underline hover:text-white" onClick={() => load(sampleId)}>Reset to sample</button>
          </span>
        </label>}
        <div className="sm:col-span-2">
          <button type="button" className={buttonClass} onClick={() => { void send(); }} disabled={!path.trim() || (method === "POST" && !body.trim())}>
            {pending ? "Waiting for the provider..." : "Send raw request"}
          </button>
          <p className="mt-2 text-xs text-slate-500">May incur provider charges. 60-second timeout, no retries, redirects are reported but never followed. Output over 256 KB is cut.</p>
        </div>
      </fieldset>
      {pending && <button type="button" className={`${buttonClass} mt-3`} onClick={() => { controller.current?.abort(); setError("Request cancelled."); }}>Cancel request</button>}
      <div aria-live="polite">
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        {exchange && <div className="mt-5 space-y-4 text-sm">
          {response && <p className={response.status < 300 ? "text-emerald-300" : "text-amber-300"}>
            HTTP {response.status} {response.statusText} · {exchange.durationMs} ms (first byte {response.timeToFirstByteMs} ms) · {response.bodyBytes.toLocaleString("en-US")} bytes
          </p>}
          {exchange.error && <div role="alert" className="border-l-2 border-rose-600 bg-rose-600/5 p-3 text-rose-300">
            <div>{exchange.error.code ? <code>{exchange.error.code}</code> : "Request failed"}: {exchange.error.message}</div>
            {exchange.error.hint && <div className="mt-1 text-xs">{exchange.error.hint}</div>}
          </div>}
          {exchange.observations.length > 0 && <ul aria-label="What this means" className="list-disc space-y-1 pl-5 text-slate-300">
            {exchange.observations.map((note) => <li key={note}>{note}</li>)}
          </ul>}
          {response && <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Response headers</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words">{Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`).join("\n")}</pre>
          </details>}
          <details className="text-xs text-slate-400">
            <summary className="cursor-pointer">Request as sent (credentials masked)</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words">{`${exchange.request.method} ${exchange.request.url}\n${Object.entries(exchange.request.headers).map(([name, value]) => `${name}: ${value}`).join("\n")}`}</pre>
          </details>
          {response && <div>
            <label className="mb-2 flex items-center gap-2 text-xs text-slate-400">
              <input aria-label="Pretty-print JSON" type="checkbox" className="size-4 accent-sky-500" checked={prettyJson} onChange={(event) => setPrettyJson(event.target.checked)} />
              Pretty-print JSON
            </label>
            <pre aria-label="Raw response body" className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words border border-slate-800 bg-black/30 p-3 text-xs text-slate-200">
              {response.body ? (prettyJson && isJsonResponse ? pretty(response.body) : response.body) : "(empty body)"}
            </pre>
          </div>}
          <div>
            <button type="button" className={buttonClass} onClick={() => { void copyReport(); }}>Copy report</button>
            <span className="ml-3 text-xs text-slate-500">{copied || "Plain text with credentials redacted, for sharing with the developers."}</span>
          </div>
        </div>}
      </div>
    </section>
  );
}
