import type { AuthInfo, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import packageJson from "../../../package.json" with { type: "json" };
import type { Db } from "../db/client";
import { authenticateIntakeKey, intakeContext, type IntakePrincipal } from "../domain/keys";
import { PROMPTS, SERVER_INSTRUCTIONS } from "./guidance";
import { toolError, type AgintTool } from "./tool";
import { TOOLS } from "./tools";

export interface AgintMcpDeps {
  getDb: () => Db;
}

type ToolCallContext = Pick<ServerContext, "http">;

function registerTool(server: McpServer, tool: AgintTool, getDb: () => Db): void {
  server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations }, async (input: unknown, call: ToolCallContext) => {
    const principal = call.http?.authInfo?.extra?.principal as IntakePrincipal | undefined;
    if (!principal) return toolError(new Error("MCP request reached a tool without a verified intake key"));
    return tool.execute(intakeContext(getDb(), principal), input);
  });
}

export function registerAgintServer(server: McpServer, { getDb }: AgintMcpDeps): void {
  for (const tool of TOOLS) registerTool(server, tool, getDb);
  for (const prompt of PROMPTS) {
    server.registerPrompt(prompt.name, { title: prompt.title, description: prompt.description }, () => ({
      description: prompt.description,
      messages: [{ role: "user", content: { type: "text", text: prompt.text } }],
    }));
  }
}

/**
 * The MCP endpoint. Every request carries `Authorization: Bearer agt_…`, an intake key a person issued;
 * the key alone decides the network. For clients that only take a URL, `?key=` is accepted too.
 */
export function createAgintMcpHandler(deps: AgintMcpDeps): (request: Request) => Promise<Response> {
  const handler = createMcpHandler((server) => registerAgintServer(server, deps), {
    serverInfo: { name: "agint", version: packageJson.version },
    instructions: SERVER_INSTRUCTIONS,
  });
  const verify = async (request: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
    const token = bearerToken ?? new URL(request.url).searchParams.get("key") ?? undefined;
    if (!token) return undefined;
    const principal = await authenticateIntakeKey(deps.getDb(), token);
    if (!principal) return undefined;
    return { token, clientId: principal.keyId, scopes: [], extra: { principal } };
  };
  return withMcpAuth(handler, verify, { required: true });
}
