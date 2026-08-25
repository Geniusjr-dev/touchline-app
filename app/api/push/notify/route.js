import {
  buildMatchNotification,
  pushIsConfigured,
  requireMatchScorer,
  sameOriginRequest,
  sendMatchNotification,
} from "@/lib/server/push";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    if (!sameOriginRequest(request)) return Response.json({ error: "The notification request origin is invalid." }, { status: 403 });
    if (!pushIsConfigured()) return Response.json({ skipped: true, reason: "not_configured" });
    const { matchId, kind, eventId = null, previousStatus = null } = await request.json();
    if (!matchId || !["event", "status"].includes(kind)) {
      return Response.json({ error: "A valid notification request is required." }, { status: 400 });
    }
    if (kind === "event" && !eventId) {
      return Response.json({ error: "An event is required for this notification." }, { status: 400 });
    }
    const { admin } = await requireMatchScorer(request, matchId);
    const message = await buildMatchNotification(admin, matchId, kind, eventId, previousStatus);
    if (!message) return Response.json({ skipped: true, reason: "event_not_notifiable" });
    const result = await sendMatchNotification(admin, matchId, message);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const denied = /Authentication|session|access|assigned|active/i.test(error.message || "");
    return Response.json({ error: error.message || "The match alert could not be sent." }, { status: denied ? 403 : 400 });
  }
}
