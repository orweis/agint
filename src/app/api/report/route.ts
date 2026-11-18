import { getDb } from "@/server/db/client";
import { isDomainError } from "@/server/domain/errors";
import { autoReport } from "@/server/domain/intake";
import { authenticateIntakeKey, intakeContext } from "@/server/domain/keys";

/**
 * POST /api/report with `Authorization: Bearer agt_…`: the hook path. One JSON body checks the agent in
 * and records its activity and sightings, so a harness hook reports every tool call without the model's help.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const principal = token ? await authenticateIntakeKey(getDb(), token) : null;
  if (!principal) return Response.json({ error: "unauthorized", message: "Send a live AGINT intake key as a Bearer token." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid", message: "The body must be JSON." }, { status: 400 });
  }
  try {
    return Response.json(await autoReport(intakeContext(getDb(), principal), body as never));
  } catch (error) {
    if (isDomainError(error)) return Response.json({ error: error.code, message: error.message }, { status: error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400 });
    console.error("AGINT report failed", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
