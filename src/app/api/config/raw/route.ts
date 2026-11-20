import {
  authorizeConfiguration, configurationError, loadConnections, parseApi, readConfigurationBody,
} from "@/lib/server/connections";
import { parseRawRequest, sendRawRequest } from "@/lib/server/raw-request";

export async function POST(request: Request) {
  try {
    authorizeConfiguration(request);
    const body = await readConfigurationBody(request);
    const settings = parseApi(body.settings, (await loadConnections()).api);
    const exchange = await sendRawRequest(settings, parseRawRequest(body.request), request.signal);
    return Response.json(exchange, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return configurationError(error); }
}
