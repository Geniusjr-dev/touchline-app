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
  if (Boolean(body?.matchId) === Boolean(body?.teamId) || !validSubscription(body.subscription)) {
    throw new Error("A valid team or match and device subscription are required.");
  }
  const team = Boolean(body.teamId);
  return {
    ...body,
    targetId: team ? body.teamId : body.matchId,
    targetTable: team ? "teams" : "matches",
    linkTable: team ? "team_push_subscriptions" : "match_push_subscriptions",
    targetColumn: team ? "team_id" : "match_id",
  };
}

export async function POST(request) {
  try {
    if (!pushIsConfigured()) return Response.json({ error: "Match notifications are not configured." }, { status: 503 });
    const { targetId, targetTable, linkTable, targetColumn, subscription, action = "subscribe" } = await parseRequest(request);
    const admin = getPushAdminClient();
    const { data: target, error: targetError } = await admin.from(targetTable)
      .select(targetTable === "matches" ? "id,status" : "id").eq("id", targetId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return Response.json({ error: "Team or match not found." }, { status: 404 });

    const { data: existing, error: existingError } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();

    if (existingError) throw existingError;

    if (action === "status") {
      if (!existing) return Response.json({ enabled: false });
      const { data: link, error: lookupError } = await admin
        .from(linkTable)
        .select(targetColumn)
        .eq("push_subscription_id", existing.id)
        .eq(targetColumn, targetId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      return Response.json({ enabled: Boolean(link) });
    }

    if (["ft", "awarded", "cancelled"].includes(target.status)) {
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
      .from(linkTable)
      .upsert({ push_subscription_id: saved.id, [targetColumn]: targetId }, { onConflict: `push_subscription_id,${targetColumn}` });
    if (linkError) throw linkError;
    return Response.json({ enabled: true });
  } catch (error) {
    return Response.json({ error: error.message || "The notification preference could not be saved." }, { status: 400 });
  }
}

export async function DELETE(request) {
  try {
    if (!pushIsConfigured()) return Response.json({ error: "Match notifications are not configured." }, { status: 503 });
    const { targetId, linkTable, targetColumn, subscription } = await parseRequest(request);
    const admin = getPushAdminClient();
    const { data: saved, error: lookupError } = await admin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!saved) return Response.json({ enabled: false });
    const { error: removeError } = await admin
      .from(linkTable)
      .delete()
      .eq("push_subscription_id", saved.id)
      .eq(targetColumn, targetId);
    if (removeError) throw removeError;
    return Response.json({ enabled: false });
  } catch (error) {
    return Response.json({ error: error.message || "The notification preference could not be removed." }, { status: 400 });
  }
}
