import { adminDb } from "@/lib/db";
import { handleMcpRequest } from "@/lib/server/mcp/server";

// MCP (Streamable HTTP, без сессий): https://<домен>/api/mcp
export const runtime = "nodejs";
export const maxDuration = 60;

async function handler(req: Request): Promise<Response> {
  return handleMcpRequest(adminDb(), req);
}

export { handler as GET, handler as POST, handler as DELETE };
