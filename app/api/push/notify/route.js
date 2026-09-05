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
    if (!matchId || !["event", "scorer", "status", "test"].includes(kind)) {
      return Response.json({ error: "A valid notification request is required." }, { status: 400 });
    }
    if (["event", "scorer"].includes(kind) && !eventId) {
      return Response.json({ error: "An event is required for this notification." }, { status: 400 });
    }
    const { admin } = await requireMatchScorer(request, matchId);
    const message = await buildMatchNotification(admin, matchId, kind, eventId, previousStatus);
    if (!message) return Response.json({ skipped: true, reason: "event_not_notifiable" });
    const result = await sendMatchNotification(admin, matchId, message);
    if (!result.linked) {
      return Response.json({
        error: "No phones are subscribed to this match. Open this exact match on the phone and turn on its notification bell.",
        ...result,
      }, { status: 409 });
    }
    if (result.failed) {
      return Response.json({
        error: result.deliveryError || "One or more match notifications could not be delivered.",
        ...result,
      }, { status: 502 });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const denied = /Authentication|session|access|assigned|active/i.test(error.message || "");
    return Response.json({ error: error.message || "The match alert could not be sent." }, { status: denied ? 403 : 400 });
  }
}
