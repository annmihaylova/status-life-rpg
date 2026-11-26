import { FORMULA_VERSION } from "@/lib/game/config";

export function GET() {
  return Response.json({ ok: true, formulaVersion: FORMULA_VERSION });
}
