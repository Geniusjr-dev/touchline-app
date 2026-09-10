"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTheme } from "@/lib/theme";

const triggerDistance = 72;
const maximumDistance = 112;

export default function PullToRefresh() {
  const { t } = useTheme();
  const startRef = useRef(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interactive = (target) => target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

    const onTouchStart = (event) => {
      if (window.scrollY > 0 || event.touches.length !== 1 || interactive(event.target)) return;
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY, vertical: null };
    };

    const onTouchMove = (event) => {
      const start = startRef.current;
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (start.vertical == null && Math.max(Math.abs(dx), Math.abs(dy)) > 8) start.vertical = Math.abs(dy) > Math.abs(dx) * 1.2;
      if (!start.vertical || dy <= 0 || window.scrollY > 0) return;
      event.preventDefault();
      setDistance(Math.min(maximumDistance, Math.round(Math.sqrt(dy) * 8.2)));
    };

    const finish = () => {
      if (!startRef.current) return;
      startRef.current = null;
      setDistance((current) => {
        if (current >= triggerDistance) {
          setRefreshing(true);
          window.setTimeout(() => window.location.reload(), 120);
          return 54;
        }
        return 0;
      });
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", finish, { passive: true });
    document.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", finish);
      document.removeEventListener("touchcancel", finish);
    };
  }, []);

  const visible = distance > 0 || refreshing;
  return (
    <div
      aria-live="polite"
      aria-label={refreshing ? "Refreshing" : distance >= triggerDistance ? "Release to refresh" : "Pull to refresh"}
      className="fixed left-1/2 z-[100] flex items-center justify-center rounded-full transition-[opacity,transform] duration-150"
      style={{
        top: `max(8px, env(safe-area-inset-top))`,
        width: 38,
        height: 38,
        background: t.card,
        color: t.text,
        border: `1px solid ${t.divider}`,
        boxShadow: "0 6px 20px rgba(0,0,0,.28)",
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
        transform: `translate(-50%, ${visible ? Math.max(0, distance - 34) : -54}px)`,
      }}
    >
      <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} style={{ transform: refreshing ? undefined : `rotate(${Math.min(220, distance * 2.4)}deg)` }} />
    </div>
  );
}
