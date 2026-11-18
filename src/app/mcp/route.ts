import { getDb } from "@/server/db/client";
import { createAgintMcpHandler } from "@/server/mcp/handler";

const handler = createAgintMcpHandler({ getDb });

export { handler as DELETE, handler as GET, handler as POST };
