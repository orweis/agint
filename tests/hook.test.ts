import { describe, expect, it } from "vitest";

import { AutoReportInput } from "@/server/domain/schemas";

// @ts-expect-error -- a plain .mjs script, shipped to people's machines as is.
import { activityOf } from "../hooks/claude-code/agint-hook.mjs";

const call = (tool_name: string, tool_input: Record<string, unknown>) => activityOf({ hook_event_name: "PostToolUse", tool_name, tool_input });

describe("the Claude Code hook", () => {
  it("maps tool calls to metadata-only activities", () => {
    expect(call("Read", { file_path: "/repo/src/a.ts" })).toMatchObject({ action: "read", targets: [{ kind: "resource", name: "/repo/src/a.ts" }] });
    expect(call("Edit", { file_path: "/repo/src/a.ts", old_string: "secret", new_string: "x" })).toMatchObject({ action: "write" });
    expect(call("WebFetch", { url: "https://docs.stripe.com/api?key=abc" })).toMatchObject({ targets: [{ kind: "service", name: "docs.stripe.com" }] });
    expect(call("mcp__notes-sync__save_note", { body: "..." })).toMatchObject({ action: "call", targets: [{ kind: "mcp_server", name: "notes-sync" }, { kind: "tool", name: "notes-sync.save_note" }] });
    expect(call("Task", { subagent_type: "code-reviewer", description: "Review" })).toMatchObject({ action: "spawn", targets: [{ kind: "agent", name: "code-reviewer" }] });
    expect(call("mcp__agint__report_activity", {})).toBeNull();
    expect(call("TodoWrite", {})).toBeNull();
  });

  it("keeps only a command's program and subcommand", () => {
    const activity = call("Bash", { command: "OPENAI_API_KEY=sk-123 curl -H 'Authorization: Bearer xyz' https://api.example.com" });
    expect(activity).toMatchObject({ action: "execute", targets: [{ kind: "tool", name: "curl -H" }] });
    expect(JSON.stringify(activity)).not.toContain("sk-123");
    expect(JSON.stringify(activity)).not.toContain("xyz");
  });

  it("builds bodies the report endpoint accepts", () => {
    const body = { checkIn: { name: "claude-code@web", harness: "claude-code", host: "maya-mbp" }, activities: [call("Read", { file_path: "a" })] };
    expect(AutoReportInput.safeParse(body).success).toBe(true);
  });
});
