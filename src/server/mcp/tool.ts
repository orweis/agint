import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";

import type { Ctx } from "../domain/context";
import { isDomainError } from "../domain/errors";
import type { ServiceFn } from "../domain/service";

export interface AgintTool {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  annotations: ToolAnnotations;
  execute: (ctx: Ctx, input: unknown) => Promise<CallToolResult>;
}

interface ToolSpec<S extends z.ZodObject, O> {
  name: string;
  title: string;
  description: string;
  service: ServiceFn<S, O>;
  /** Text shown to the model; defaults to the JSON of the result. */
  format?: (output: O) => string;
}

/**
 * An MCP tool that is one domain service: its input is the service's schema. Every AGINT tool only
 * adds reports (never reads the map, never removes anything), so none is read-only or destructive.
 */
export function serviceTool<S extends z.ZodObject, O>(spec: ToolSpec<S, O>): AgintTool {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.service.schema,
    annotations: { title: spec.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    execute: async (ctx, input) => {
      try {
        const output = await spec.service(ctx, input as z.input<S>);
        return toolResult(output as object, spec.format?.(output));
      } catch (error) {
        return toolError(error);
      }
    },
  };
}

export function toolResult(output: object, text = JSON.stringify(output)): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: output as Record<string, unknown> };
}

export function toolError(error: unknown): CallToolResult {
  if (isDomainError(error)) return { isError: true, content: [{ type: "text", text: `${error.code}: ${error.message}` }] };
  console.error("AGINT MCP tool failed", error);
  return { isError: true, content: [{ type: "text", text: "internal_error: AGINT could not record this report." }] };
}
