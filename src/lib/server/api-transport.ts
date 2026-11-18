import { Agent, EnvHttpProxyAgent } from "undici";
import type { ApiEndpointSettings } from "@/lib/connections";

export async function fetchApi(settings: ApiEndpointSettings, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const tls = {
    rejectUnauthorized: settings.verifySsl === true,
    ...(settings.caCertificate ? { ca: settings.caCertificate } : {}),
  };
  const dispatcher = settings.trustEnv
    ? new EnvHttpProxyAgent({ connect: tls, requestTls: tls })
    : new Agent({ connect: tls });
  try {
    const options = { ...init, dispatcher };
    const response = await fetch(input, options);
    if (!response.body) {
      await dispatcher.close();
      return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            await dispatcher.close();
            controller.close();
          } else controller.enqueue(value);
        } catch (error) {
          await dispatcher.destroy();
          controller.error(error);
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason); } finally { await dispatcher.destroy(); }
      },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    await dispatcher.destroy();
    throw error;
  }
}
