import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchApi } from "./api-transport";

let directory: string;
let server: Server;
let baseUrl: string;
let caCertificate: string;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "model-tls-test-"));
  await promisify(execFile)("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", path.join(directory, "key.pem"), "-out", path.join(directory, "cert.pem"),
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
  ]);
  caCertificate = await readFile(path.join(directory, "cert.pem"), "utf8");
  server = createServer({ key: await readFile(path.join(directory, "key.pem")), cert: caCertificate }, (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"ok":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing HTTPS server port.");
  baseUrl = `https://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("endpoint-scoped API TLS", () => {
  it("disables verification by default but preserves explicit verification and the global default", async () => {
    const defaultResponse = await fetchApi({ baseUrl }, baseUrl);
    expect(await defaultResponse.json()).toEqual({ ok: true });
    await expect(fetchApi({ baseUrl, verifySsl: true }, baseUrl)).rejects.toThrow();
    const response = await fetchApi({ baseUrl, verifySsl: false }, baseUrl);
    expect(await response.json()).toEqual({ ok: true });
    await expect(fetch(baseUrl)).rejects.toThrow();
  });

  it("trusts an endpoint-specific CA with verification enabled", async () => {
    const response = await fetchApi({ baseUrl, verifySsl: true, caCertificate }, baseUrl);
    expect(await response.json()).toEqual({ ok: true });
    await expect(fetchApi({ baseUrl, verifySsl: true }, baseUrl)).rejects.toThrow();
  });

  it("closes scoped connections when the consumer cancels a response", async () => {
    const response = await fetchApi({ baseUrl, verifySsl: false }, baseUrl);
    await response.body?.cancel();
  });

  it("only uses the environment proxy when enabled and honors no_proxy", async () => {
    // The local HTTPS fixture is a valid origin, not a trusted proxy.
    vi.stubEnv("https_proxy", baseUrl);
    vi.stubEnv("http_proxy", baseUrl);
    vi.stubEnv("no_proxy", "");
    try {
      const settings = { baseUrl, verifySsl: true, caCertificate };
      expect(await (await fetchApi({ ...settings, trustEnv: false }, baseUrl)).json()).toEqual({ ok: true });
      await expect(fetchApi({ ...settings, trustEnv: true }, baseUrl)).rejects.toThrow();
      vi.stubEnv("no_proxy", "127.0.0.1");
      expect(await (await fetchApi({ ...settings, trustEnv: true }, baseUrl)).json()).toEqual({ ok: true });
    } finally { vi.unstubAllEnvs(); }
  });
});
