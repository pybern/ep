"use client";

import { useState, type ReactNode } from "react";
import {
  MAX_TOKENS_PARAMS, STRUCTURED_OUTPUT_MODES, isMaxTokensParam, isStructuredOutputMode,
  type ApiSettings, type RequestHeaders,
} from "@/lib/connections";
import { COMPATIBILITY_EXAMPLES } from "@/lib/provider-samples";
import { llmEnvironmentLines } from "@/lib/provider-request";

const inputClass = "mt-2 w-full border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500";
const rowInputClass = "w-full border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500";
const buttonClass = "min-h-10 border border-slate-600 px-4 text-sm text-slate-200 transition hover:border-sky-400 hover:text-white disabled:opacity-50";
const MODE_LABELS: Record<typeof STRUCTURED_OUTPUT_MODES[number], string> = {
  json_schema: "json_schema: send the schema to the provider",
  json_object: "json_object: provider JSON mode, schema added to the prompt",
  prompt: "prompt: no response_format, schema in the prompt only",
};

type Row = { id: number; name: string; value: string | null };
let nextRow = 1;
const rowsFrom = (headers: RequestHeaders | undefined): Row[] => Object.entries(headers ?? {}).map(([name, value]) => ({ id: nextRow++, name, value }));
const headersFrom = (rows: Row[]): RequestHeaders | undefined => {
  const named = rows.filter((row) => row.name.trim());
  return named.length ? Object.fromEntries(named.map((row) => [row.name.trim(), row.value])) : undefined;
};

function Hint({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{children}</span>;
}

export type ProviderCompatibilityChange = Partial<Pick<ApiSettings, "structuredOutput" | "streaming" | "maxTokensParam" | "dropParams" | "extraBody" | "requestHeaders">>;

/**
 * Fields for adapting requests to a strict provider. Header and JSON text is edited locally and only valid values
 * reach the parent, which is told about invalid JSON through onError so Test and Save can be blocked.
 */
export function ProviderCompatibility({ api, onChange, onError, defaultOpen = false }: {
  api: Omit<ApiSettings, "apiKey">;
  onChange: (change: ProviderCompatibilityChange) => void;
  onError: (message: string) => void;
  defaultOpen?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(api.requestHeaders));
  const [dropText, setDropText] = useState(() => (api.dropParams ?? []).join(", "));
  const [bodyText, setBodyText] = useState(() => api.extraBody ? JSON.stringify(api.extraBody, null, 2) : "");
  const [bodyError, setBodyError] = useState("");
  const [copied, setCopied] = useState("");
  const configured = Boolean(api.structuredOutput || api.streaming === false || api.maxTokensParam || api.dropParams?.length || api.extraBody || api.requestHeaders);
  const [open, setOpen] = useState(configured || defaultOpen);

  function setHeaders(next: Row[]) {
    setRows(next);
    onChange({ requestHeaders: headersFrom(next) });
  }

  function editBody(value: string) {
    setBodyText(value);
    if (!value.trim()) { setBodyError(""); onError(""); onChange({ extraBody: undefined }); return; }
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      setBodyError("");
      onError("");
      onChange({ extraBody: parsed as Record<string, unknown> });
    } catch {
      const message = "Extra request parameters must be a valid JSON object. Fix it before testing or saving.";
      setBodyError(message);
      onError(message);
    }
  }

  function editDrop(value: string) {
    setDropText(value);
    const names = value.split(/[,\s]+/).map((name) => name.trim()).filter(Boolean);
    onChange({ dropParams: names.length ? names : undefined });
  }

  function applyExample(id: string) {
    const example = COMPATIBILITY_EXAMPLES.find((item) => item.id === id);
    if (!example) return;
    const next = [...rows];
    for (const name of example.headerNames ?? []) {
      if (!next.some((row) => row.name.toLowerCase() === name.toLowerCase())) next.push({ id: nextRow++, name, value: "" });
    }
    const { structuredOutput, streaming, maxTokensParam, dropParams, extraBody } = example.settings;
    setRows(next);
    setDropText((dropParams ?? []).join(", "));
    setBodyText(extraBody ? JSON.stringify(extraBody, null, 2) : "");
    setBodyError("");
    onError("");
    onChange({ structuredOutput, streaming, maxTokensParam, dropParams, extraBody, requestHeaders: headersFrom(next) });
  }

  async function copyEnvironment() {
    try {
      await navigator.clipboard.writeText(llmEnvironmentLines(api));
      setCopied("Copied.");
    } catch { setCopied("Copy is blocked in this browser. Select the text above instead."); }
  }

  return (
    <details className="border border-slate-700 p-4 sm:col-span-2" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm text-slate-200">
        Provider compatibility (advanced){configured && <span className="ml-2 text-xs text-sky-300">customised</span>}
      </summary>
      {open && <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <p className="text-xs leading-relaxed text-slate-500 sm:col-span-2">
          Adapt every request the app sends (connection test, request builder, chat and research) to a strict or unusual provider.
          Test with the unsaved values, use the Raw request console below to see exactly what the provider says, then save.
          After database initialization, saved provider settings take precedence over LLM_* environment variables.
        </p>
        <label className="block text-sm text-slate-300 sm:col-span-2">Start from an example
          <select aria-label="Compatibility example" className={inputClass} value="" onChange={(event) => applyExample(event.target.value)}>
            <option value="">Choose to fill the fields below…</option>
            {COMPATIBILITY_EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.label} — {example.description}</option>)}
          </select>
          <Hint>Replaces the fields below (existing headers are kept). Edit them afterwards; nothing is saved until you press Save settings.</Hint>
        </label>
        <label className="block text-sm text-slate-300 sm:col-span-2">Structured output
          <select aria-label="Structured output" className={inputClass} value={api.structuredOutput ?? ""} onChange={(event) => onChange({ structuredOutput: isStructuredOutputMode(event.target.value) ? event.target.value : undefined })}>
            <option value="">Default ({MODE_LABELS.json_schema})</option>
            {STRUCTURED_OUTPUT_MODES.filter((mode) => mode !== "json_schema").map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
          </select>
          <Hint>Planning, chart choice and the connection test need JSON. Use json_object or prompt when the provider answers HTTP 400 to response_format. In both, JSON calls are answered without streaming so code fences and thinking tags can be removed.</Hint>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-300 sm:col-span-2">
          <input aria-label="Stream responses" type="checkbox" className="mt-0.5 size-4 accent-sky-500" checked={api.streaming !== false} onChange={(event) => onChange({ streaming: event.target.checked ? undefined : false })} />
          <span>Stream responses<Hint>Turn off for gateways or proxies that cannot stream. The app then requests whole replies and replays them as a stream, so thinking and answers still appear.</Hint></span>
        </label>
        <label className="block text-sm text-slate-300">Max-token parameter name
          <select aria-label="Max-token parameter" className={inputClass} value={api.maxTokensParam ?? ""} onChange={(event) => onChange({ maxTokensParam: isMaxTokensParam(event.target.value) ? event.target.value : undefined })}>
            <option value="">Default (max_tokens)</option>
            {MAX_TOKENS_PARAMS.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <Hint>Azure OpenAI and o-series models reject max_tokens and want max_completion_tokens.</Hint>
        </label>
        <label className="block text-sm text-slate-300">Parameters to drop
          <input aria-label="Parameters to drop" className={inputClass} value={dropText} onChange={(event) => editDrop(event.target.value)} placeholder="temperature, top_p, reasoning_effort" />
          <Hint>Top-level request fields removed from every chat request, separated by commas. messages and stream cannot be dropped.</Hint>
        </label>
        <label className="block text-sm text-slate-300 sm:col-span-2">Extra request parameters (JSON object)
          <textarea aria-label="Extra request parameters" className={`${inputClass} font-mono text-xs`} rows={4} value={bodyText} onChange={(event) => editBody(event.target.value)} placeholder={'{"chat_template_kwargs": {"enable_thinking": false}}'} spellCheck={false} />
          <Hint>Merged into every chat request body after the drop list, so they win over the app&apos;s own values. Do not put secrets here; use headers.</Hint>
          {bodyError && <span role="alert" className="mt-1 block text-xs text-rose-300">{bodyError}</span>}
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm text-slate-300">Custom request headers</legend>
          <Hint>Sent on every model and catalog request. Values are credentials: they are stored on the server and never returned to the browser. A custom Authorization header replaces the Bearer API key.</Hint>
          <div className="mt-2 space-y-2">
            {rows.map((row, index) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                <input aria-label={`Header ${index + 1} name`} className={rowInputClass} value={row.name} placeholder="Header name, e.g. api-key" autoComplete="off" onChange={(event) => setHeaders(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} />
                <input aria-label={`Header ${index + 1} value`} type="password" autoComplete="new-password" className={rowInputClass} value={row.value ?? ""} placeholder={row.value === null ? "Saved value (unchanged)" : "Header value"} onChange={(event) => setHeaders(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} />
                <button type="button" className="border border-slate-700 px-3 text-xs text-slate-400 hover:text-white" onClick={() => setHeaders(rows.filter((item) => item.id !== row.id))}>Remove</button>
              </div>
            ))}
          </div>
          <button type="button" className={`${buttonClass} mt-3`} disabled={rows.length >= 20} onClick={() => setRows([...rows, { id: nextRow++, name: "", value: "" }])}>Add header</button>
        </fieldset>
        <div className="sm:col-span-2">
          <div className="text-sm text-slate-300">Environment variable equivalent</div>
          <Hint>For deployments where LLM_* variables manage the model settings. Copy these into the deployment environment; set the API key and header values there as secrets.</Hint>
          <pre aria-label="Environment variable equivalent" className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words border border-slate-800 bg-black/30 p-3 text-xs text-slate-300">{llmEnvironmentLines(api)}</pre>
          <button type="button" className={`${buttonClass} mt-2`} onClick={() => { void copyEnvironment(); }}>Copy environment lines</button>
          {copied && <span aria-live="polite" className="ml-3 text-xs text-slate-400">{copied}</span>}
        </div>
      </div>}
    </details>
  );
}
