"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLeagueCentre, getMatch, getTeamCentre } from "@/lib/db";

const loaders = { league: getLeagueCentre, team: getTeamCentre, match: getMatch };

export default function NavigationWarmup() {
  const router = useRouter();
  useEffect(() => {
    let timer;
    let hovered;
    const findLink = (event) => event.target instanceof Element ? event.target.closest("a[href]") : null;
    const warm = (link) => {
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !["https:", "http:"].includes(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      const detail = url.pathname.match(/^\/(league|team|match)\/([a-z0-9-]+)\/?$/i);
      if (!detail && !/^\/(?:leagues|search)?\/?$/.test(url.pathname)) return;
      router.prefetch(url.pathname + url.search);
      if (detail && loaders[detail[1]]) void loaders[detail[1]](detail[2]).catch(() => {});
    };
    const cancelHover = () => { window.clearTimeout(timer); hovered = null; };
    const onHover = (event) => {
      if (event.pointerType === "touch" || navigator.connection?.saveData) return;
      const link = findLink(event);
      if (link === hovered) return;
      cancelHover();
      hovered = link;
      if (link) timer = window.setTimeout(() => warm(link), 120);
    };
    const onLeave = (event) => {
      if (hovered && event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget)) return;
      cancelHover();
    };
    const onIntent = (event) => {
      if (event.type === "pointerdown" && event.button !== 0) return;
      cancelHover();
      warm(findLink(event));
    };
    document.addEventListener("pointerover", onHover);
    document.addEventListener("pointerout", onLeave);
    document.addEventListener("pointerdown", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent);
    return () => {
      cancelHover();
      document.removeEventListener("pointerover", onHover);
      document.removeEventListener("pointerout", onLeave);
      document.removeEventListener("pointerdown", onIntent);
      document.removeEventListener("focusin", onIntent);
    };
  }, [router]);
  return null;
}
