import { getVapidPublicKey, pushIsConfigured } from "@/lib/server/push";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(
    { ready: pushIsConfigured(), publicKey: getVapidPublicKey() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
