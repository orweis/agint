import { checkIn, checkOut, reportActivity, reportSightings, setTask } from "../domain/intake";
import { serviceTool, type AgintTool } from "./tool";

const withheldNote = (count: number) =>
  count ? ` AGINT withheld ${count} value(s) that looked like secrets. Report credentials by name and location only, never by value.` : "";

export const TOOLS: AgintTool[] = [
  serviceTool({
    name: "check_in",
    title: "Check in",
    description:
      "Call first, once per session. Tells AGINT who you are (a stable name, harness, model, runtime, host), who you work for, your task, and what is set up for you (tools, MCP servers, repositories, credentials issued to you, by name only). Returns your agentId, which every other AGINT tool needs. Checking in again with the same name, harness and host returns the same agentId.",
    service: checkIn,
    format: (out) =>
      JSON.stringify(out) +
      `\nKeep agentId ${out.agentId}. ` +
      (out.connectedLead ? `You were already a lead in AGINT's picture (reported by ${out.connectedLead.reportedBy} other agent(s)); you now report your own view. ` : "") +
      "Next: look once at what you can see from where you run and call report_sightings, then report_activity as you work." +
      withheldNote(out.withheld),
  }),
  serviceTool({
    name: "report_activity",
    title: "Report activity",
    description:
      "Debrief what you did: each activity is an action (read, write, create, delete, execute, call, query, deploy, send, authenticate, spawn, delegate) on one or more targets (files, URLs, repositories, services, data stores, tools, MCP servers, credentials, other agents). Batch several per call, oldest first; include failed or denied attempts. Metadata only, never secret values or content.",
    service: reportActivity,
    format: (out) => `Recorded ${out.recorded} activit${out.recorded === 1 ? "y" : "ies"}.` + withheldNote(out.withheld),
  }),
  serviceTool({
    name: "report_sightings",
    title: "Report sightings",
    description:
      "Report things around you that are not yours: credentials you were not issued (by name and location, never value), other agents or harnesses on your machine, unrecognised MCP servers, agents or jobs sharing your pipeline (sharesJob), and agents you only heard of (basis \"mentioned\"). Each becomes a lead for a person to review. Never contact, test or use what you sighted.",
    service: reportSightings,
    format: (out) =>
      `Recorded ${out.recorded} sighting(s): ` + out.leads.map((lead) => `${lead.name} (${lead.kind}, now ${lead.state})`).join("; ") + "." + withheldNote(out.withheld),
  }),
  serviceTool({
    name: "set_task",
    title: "Change task",
    description: "Call when your task changes (a new request from your principal, a handoff). Optionally updates who you work for.",
    service: setTask,
  }),
  serviceTool({
    name: "check_out",
    title: "Check out",
    description: "Call when you finish your session, with a one-line summary of what you did. Report any remaining activity first.",
    service: checkOut,
  }),
];
