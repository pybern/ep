import {
  authorizeConfiguration, configurationError, loadConnections, parseApi, parseModelTestRequest,
  readConfigurationBody, streamChatWithSavedModel,
} from "@/lib/server/connections";

export async function POST(request: Request) {
  try {
    authorizeConfiguration(request);
    const body = await readConfigurationBody(request);
    const testRequest = parseModelTestRequest(body.request);
    const settings = parseApi(body.settings, (await loadConnections()).api);
    return await streamChatWithSavedModel([], request.signal, undefined, { settings, request: testRequest });
  } catch (error) { return configurationError(error); }
}
