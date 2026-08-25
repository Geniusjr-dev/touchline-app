self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: "Touchline", body: event.data ? event.data.text() : "Match update." };
  }
  event.waitUntil(self.registration.showNotification(message.title || "Touchline", {
    body: message.body || "Match update.",
    icon: "/touchline-icon.svg",
    badge: "/touchline-badge.svg",
    tag: message.tag || "touchline-match-update",
    renotify: true,
    data: { url: message.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url === target);
    if (existing) {
      await existing.focus();
      return;
    }
    await self.clients.openWindow(target);
  })());
});
