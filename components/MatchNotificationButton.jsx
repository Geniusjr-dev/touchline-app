"use client";
import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function applicationServerKey(subscription) {
  const key = subscription?.options?.applicationServerKey;
  if (!key) return null;
  const bytes = new Uint8Array(key);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function iPhoneNeedsInstallation() {
  const appleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  return appleMobile && !standalone;
}

async function browserSubscription() {
  if (!supported()) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await registration.update().catch(() => {});
  await navigator.serviceWorker.ready;
  return { registration, subscription: await registration.pushManager.getSubscription() };
}

async function savePreference(matchId, subscription, action, method = "POST") {
  const response = await fetch("/api/push/subscriptions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId, subscription: subscription.toJSON(), action }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The match alert could not be changed.");
  return result;
}

export default function MatchNotificationButton({ matchId, status, color = "#FFFFFF", size = 19, compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const acceptsAlerts = !["ft", "cancelled"].includes(status);

  useEffect(() => {
    let alive = true;
    if (!acceptsAlerts || typeof window === "undefined" || !supported()) return undefined;
    browserSubscription()
      .then(async ({ subscription }) => {
        if (!subscription) return;
        const result = await savePreference(matchId, subscription, "status");
        if (alive) setEnabled(Boolean(result.enabled));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [matchId, acceptsAlerts]);

  if (!acceptsAlerts) return null;

  async function toggle() {
    if (busy) return;
    if (!supported()) {
      window.alert("Match notifications are not supported by this browser.");
      return;
    }
    if (!enabled && iPhoneNeedsInstallation()) {
      window.alert("On iPhone, add Touchline to your Home Screen, open it from there, then tap the bell again.");
      return;
    }
    setBusy(true);
    try {
      if (enabled) {
        const current = await browserSubscription();
        if (current.subscription) await savePreference(matchId, current.subscription, "unsubscribe", "DELETE");
        setEnabled(false);
        return;
      }

      if (Notification.permission === "denied") {
        throw new Error("Notifications are blocked. Allow Touchline notifications in your device settings, then try again.");
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const current = await browserSubscription();
      const configResponse = await fetch("/api/push/config", { cache: "no-store" });
      const config = await configResponse.json();
      if (!config.ready || !config.publicKey) throw new Error("Match notifications are not configured yet.");
      let subscription = current.subscription;
      const savedApplicationKey = applicationServerKey(subscription);
      if (subscription && savedApplicationKey && savedApplicationKey !== config.publicKey) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription = subscription || await current.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      await savePreference(matchId, subscription, "subscribe");
      setEnabled(true);
    } catch (error) {
      window.alert(error.message || "The match alert could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = enabled ? BellRing : Bell;
  return (
    <button
      type="button"
      aria-label={enabled ? "Turn off match notifications" : "Turn on match notifications"}
      aria-pressed={enabled}
      aria-busy={busy}
      title={enabled ? "Match notifications on" : "Turn on match notifications"}
      onClick={toggle}
      className="flex items-center justify-center"
      style={{ width: compact ? 28 : 40, height: compact ? 28 : 38, opacity: busy ? 0.55 : 1 }}
    >
      <Icon size={size} color={enabled ? "#4FC263" : color} fill={enabled ? "#4FC263" : "none"} />
    </button>
  );
}

