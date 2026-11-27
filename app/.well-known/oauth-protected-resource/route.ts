import { protectedResourceMetadata } from "@/lib/server/mcp/oauth";

// RFC 9728: метаданные защищённого ресурса MCP — по ним Claude находит сервер авторизации (Supabase).
export function GET(req: Request): Response {
  return Response.json(protectedResourceMetadata(new URL(req.url).origin), {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
}
