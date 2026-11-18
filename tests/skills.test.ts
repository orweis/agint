import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ACTIONS, ENTITY_KINDS, LIMITS, SIGHTING_BASES } from "@/lib/domain";
import { ReportSightingsInput } from "@/server/domain/schemas";
import { SERVER_INSTRUCTIONS } from "@/server/mcp/guidance";
import { TOOLS } from "@/server/mcp/tools";

const skill = readFileSync("skills/agint-reporting/SKILL.md", "utf8");

describe("skills/agint-reporting", () => {
  it("names every tool the server offers, and the instructions do too", () => {
    for (const tool of TOOLS) {
      expect(skill).toContain(`**${tool.name}**`);
      expect(SERVER_INSTRUCTIONS).toContain(tool.name);
    }
  });

  it("quotes the server's kinds, actions, bases and limits", () => {
    for (const kind of ENTITY_KINDS) expect(skill).toContain(`\`${kind}\``);
    for (const action of ACTIONS) expect(skill).toContain(action);
    for (const basis of SIGHTING_BASES) expect(skill).toContain(`\`${basis}\``);
    expect(skill).toContain(`up to ${LIMITS.activitiesPerReport} per call`);
  });

  it("its example is a valid report_sightings call", () => {
    const json = /```json\n([\s\S]+?)\n```/.exec(skill)![1]!;
    const call = JSON.parse(json) as { name: string; arguments: unknown };
    expect(call.name).toBe("report_sightings");
    expect(ReportSightingsInput.safeParse({ ...(call.arguments as object), agentId: "ag_0123456789ab" }).success).toBe(true);
  });
});
