import "server-only";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

function pushEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_CONTACT || "mailto:notifications@touchline.app";
  if (!url || !serviceKey || !publicKey || !privateKey) return null;
  return { url, serviceKey, publicKey, privateKey, subject };
}

export function pushIsConfigured() {
  return Boolean(pushEnvironment());
}

export function getVapidPublicKey() {
  return pushEnvironment()?.publicKey || null;
}

export function getPushAdminClient() {
  const environment = pushEnvironment();
  if (!environment) throw new Error("Match notifications are not configured.");
  return createClient(environment.url, environment.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function sameOriginRequest(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function requireMatchScorer(request, matchId) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new Error("Authentication is required.");

  const admin = getPushAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) throw new Error("The scorer session is invalid.");

  const [{ data: profile }, { data: match, error: matchError }] = await Promise.all([
    admin.from("profiles").select("id,status").eq("id", authData.user.id).maybeSingle(),
    admin.from("matches").select("id,organization_id").eq("id", matchId).maybeSingle(),
  ]);
  if (matchError || !match) throw new Error("Match not found.");
  if (profile?.status !== "active") throw new Error("This Touchline account is not active.");

  const { data: membership } = await admin
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", match.organization_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!membership?.active) throw new Error("You do not have access to this match.");

  if (membership.role !== "admin") {
    const { data: assignment } = await admin
      .from("match_scorers")
      .select("match_id")
      .eq("match_id", matchId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (!assignment) throw new Error("You are not assigned to score this match.");
  }
  return { admin, user: authData.user, match };
}

export async function sendWebPush(subscription, message) {
  const environment = pushEnvironment();
  if (!environment) throw new Error("Match notifications are not configured.");
  webPush.setVapidDetails(environment.subject, environment.publicKey, environment.privateKey);
  return webPush.sendNotification({
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }, JSON.stringify(message), {
    TTL: 3600,
    urgency: "high",
    contentEncoding: "aes128gcm",
  });
}

function teamName(team) {
  return team?.display_name?.trim() || team?.name || "Team";
}

export async function buildMatchNotification(admin, matchId, kind, eventId, previousStatus) {
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id,home_id,away_id,status,home_score,away_score,kickoff")
    .eq("id", matchId)
    .maybeSingle();
  if (matchError || !match) throw new Error("Match not found.");
  const { data: teams } = await admin.from("teams").select("id,name,display_name").in("id", [match.home_id, match.away_id]);
  const home = teams?.find((team) => team.id === match.home_id);
  const away = teams?.find((team) => team.id === match.away_id);
  const homeName = teamName(home);
  const awayName = teamName(away);
  const score = `${Number(match.home_score) || 0} - ${Number(match.away_score) || 0}`;
  const url = `/match/${match.id}`;

  if (kind === "test") {
    return {
      title: "Touchline notification test",
      body: `${homeName} vs ${awayName}. Match notifications are working.`,
      url,
      tag: `match-${matchId}-test-${Date.now()}`,
    };
  }

  if (kind === "event") {
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id,type,side,player,goal_type,card_type")
      .eq("id", eventId)
      .eq("match_id", matchId)
      .maybeSingle();
    if (eventError || !event) throw new Error("Match event not found.");
    const eventTeam = event.side === "home" ? homeName : awayName;
    if (event.type === "goal") {
      const heading = event.goal_type === "own_goal" ? "OWN GOAL!" : "GOAL!";
      return {
        title: `${homeName} ${score} ${awayName}`,
        body: `${heading} ${eventTeam}.${event.player ? ` ${event.player}.` : ""}`,
        url,
        tag: `match-${matchId}-event-${event.id}`,
      };
    }
    if (event.type === "red") {
      const secondYellow = event.card_type === "second_yellow";
      return {
        title: `${homeName} ${score} ${awayName}`,
        body: event.player
          ? `RED CARD! ${event.player} (${eventTeam})${secondYellow ? " is sent off after a second booking." : " is sent off."}`
          : `RED CARD! ${eventTeam} have a player sent off.`,
        url,
        tag: `match-${matchId}-event-${event.id}`,
      };
    }
    return null;
  }

  let body = "Match update.";
  if (match.status === "live" && previousStatus === "scheduled") body = "Kick-off.";
  else if (match.status === "live" && previousStatus === "ht") body = "Second half begins.";
  else if (match.status === "ht") body = `Half-time. ${homeName} ${score} ${awayName}.`;
  else if (match.status === "et_live" && previousStatus === "ft") body = "Extra time begins.";
  else if (match.status === "et_live" && previousStatus === "et_ht") body = "Extra time resumes.";
  else if (match.status === "et_ht") body = `Extra-time break. ${homeName} ${score} ${awayName}.`;
  else if (match.status === "ft") body = `Full-time. ${homeName} ${score} ${awayName}.`;
  return {
    title: match.status === "ft" || match.status === "ht" || match.status === "et_ht"
      ? `${homeName} ${score} ${awayName}`
      : `${homeName} vs ${awayName}`,
    body,
    url,
    tag: `match-${matchId}-status-${match.status}-${Number(match.home_score) || 0}-${Number(match.away_score) || 0}`,
  };
}

export async function sendMatchNotification(admin, matchId, message) {
  const { data: links, error: linkError } = await admin
    .from("match_push_subscriptions")
    .select("push_subscription_id")
    .eq("match_id", matchId);
  if (linkError) throw linkError;
  const ids = [...new Set((links || []).map((link) => link.push_subscription_id))];
  if (!ids.length || !message) return { linked: ids.length, sent: 0, failed: 0 };
  const { data: subscriptions, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .in("id", ids);
  if (subscriptionError) throw subscriptionError;

  let sent = 0;
  let failed = 0;
  const expired = [];
  const errors = [];
  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await sendWebPush(subscription, message);
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push(error?.body || error?.message || "Push delivery failed.");
      if ([404, 410].includes(error?.statusCode)) expired.push(subscription.id);
    }
  }));
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return { linked: ids.length, sent, failed, deliveryError: errors[0] || null };
}

