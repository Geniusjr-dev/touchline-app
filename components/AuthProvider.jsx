"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { getMyAccess } from "@/lib/db";

const AuthCtx = createContext({
  user: null, profile: null, memberships: [], activeOrganizationId: null, role: null,
  loading: true, signIn: async () => {}, signOut: async () => {}, setActiveOrganization: () => {},
});

const STORE_KEY = "touchline.activeOrg";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyAccess = useCallback((access) => {
    const list = access?.memberships || [];
    setProfile(access?.profile || null);
    setMemberships(list);
    const ids = list.map((m) => m.organization_id);
    let saved = null;
    try { saved = typeof window !== "undefined" ? window.localStorage.getItem(STORE_KEY) : null; } catch (_) {}
    setActiveOrganizationId((prev) => {
      if (prev && ids.includes(prev)) return prev;
      if (saved && ids.includes(saved)) return saved;
      return ids[0] || null;
    });
  }, []);

  const loadAccess = useCallback(async (u) => {
    if (!u) { setProfile(null); setMemberships([]); setActiveOrganizationId(null); return; }
    try { applyAccess(await getMyAccess(u.id)); } catch (_) { applyAccess({ profile: null, memberships: [] }); }
  }, [applyAccess]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user || null;
      setUser(u); await loadAccess(u); setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user || null;
      setUser(u); await loadAccess(u);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadAccess]);

  const role = memberships.find((m) => m.organization_id === activeOrganizationId)?.role || null;

  const setActiveOrganization = useCallback((orgId) => {
    setActiveOrganizationId(orgId);
    try { window.localStorage.setItem(STORE_KEY, orgId); } catch (_) {}
  }, []);

  const signIn = async (email, password) => {
    if (!supabase) return { error: { message: "Supabase not configured" } };
    return supabase.auth.signInWithPassword({ email, password });
  };
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); };

  return (
    <AuthCtx.Provider value={{ user, profile, memberships, activeOrganizationId, role, loading, signIn, signOut, setActiveOrganization }}>
      {children}
    </AuthCtx.Provider>
  );
}
export const useAuth = () => useContext(AuthCtx);
