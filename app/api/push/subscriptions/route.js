import { getPushAdminClient, pushIsConfigured, sameOriginRequest } from "@/lib/server/push";

export const runtime = "nodejs";

function validSubscription(subscription) {
  return Boolean(
    subscription?.endpoint
    && subscription?.keys?.p256dh
    && subscription?.keys?.auth
    && String(subscription.endpoint).startsWith("https://"),
  );
}

async function parseRequest(request) {
  if (!sameOriginRequest(request)) throw new Error("The notification request origin is invalid.");
  const body = await request.json();
  if (!body?.matchId || !validSubscription(body.subscription)) {
    throw new Error("A valid match and device subscription are required.");
  }
  return body;
}

export async function POST(request) {
  try {
    if (!pushIsConfigured()) return Response.json({ error: "Match notifications are not configured." }, { status: 503 });
    const { matchId, subscription, action = "subscribe" } = await parseRequest(request);
    const admin = getPushAdminClient();
    const { data: match } = await admin.from("matches").select("id,status").eq("id", matchId).maybeSingle();
    if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

    const { data: existing } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (action === "status") {
      if (!existing) return Response.json({ enabled: false });
      const { data: link } = await admin
        .from("match_push_subscriptions")
        .select("match_id")
        .eq("push_subscription_id", existing.id)
        .eq("match_id", matchId)
        .maybeSingle();
      return Response.json({ enabled: Boolean(link) });
    }

    if (["ft", "cancelled"].includes(match.status)) {
      return Response.json({ error: "This match is no longer accepting new alerts." }, { status: 409 });
    }

    const { data: saved, error: saveError } = await admin
      .from("push_subscriptions")
      .upsert({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        expiration_time: subscription.expirationTime || null,
        user_agent: request.headers.get("user-agent") || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" })
      .select("id")
      .single();
    if (saveError) throw saveError;
    const { error: linkError } = await admin
      .from("match_push_subscriptions")
      .upsert({ push_subscription_id: saved.id, match_id: matchId }, { onConflict: "push_subscription_id,match_id" });
    if (linkError) throw linkError;
    return Response.json({ enabled: true });
  } catch (error) {
    return Response.json({ error: error.message || "The notification preference could not be saved." }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    if (!pushIsConfigured()) return Response.json({ error: "Match notifications are not configured." }, { status: 503 });
    const { matchId, subscription } = await parseRequest(request);
    const admin = getPushAdminClient();
    const { data: saved } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (!saved) return Response.json({ enabled: false });
    await admin
      .from("match_push_subscriptions")
      .delete()
      .eq("push_subscription_id", saved.id)
      .eq("match_id", matchId);
    const { count } = await admin
      .from("match_push_subscriptions")
      .select("match_id", { count: "exact", head: true })
      .eq("push_subscription_id", saved.id);
    if (!count) await admin.from("push_subscriptions").delete().eq("id", saved.id);
    return Response.json({ enabled: false });
  } catch (error) {
    return Response.json({ error: error.message || "The notification preference could not be removed." }, { status: 400 });
  }
}
