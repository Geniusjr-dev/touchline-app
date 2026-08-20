"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getMyAccess } from "@/lib/db";

const AuthCtx = createContext({
  user: null,
  profile: null,
  memberships: [],
  activeOrganizationId: null,
  role: null,
  loading: true,
  accessError: "",
  signIn: async () => {},
  signOut: async () => {},
  setActiveOrganization: () => {},
  retryAccess: () => {},
});

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [accessAttempt, setAccessAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setProfile(null);
      setMemberships([]);
      setActiveOrganizationId(null);
      setAccessError("");
      return;
    }
    setAccessLoading(true);
    setAccessError("");

    async function resolveAccess() {
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { profile: nextProfile, memberships: nextMemberships } = await getMyAccess(user.id);
          if (!alive) return;
          setProfile(nextProfile);
          setMemberships(nextMemberships);
          const saved = window.localStorage.getItem("touchline-active-organization");
          const selected = nextMemberships.some((membership) => membership.organization_id === saved)
            ? saved
            : nextMemberships[0]?.organization_id || null;
          setActiveOrganizationId(selected);
          setAccessError("");
          setAccessLoading(false);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await wait(350 * (attempt + 1));
        }
      }
      if (!alive) return;
      setAccessError(lastError?.message || "Touchline could not verify your organization access.");
      setAccessLoading(false);
    }

    resolveAccess();
    return () => { alive = false; };
  }, [user, accessAttempt]);

  const signIn = async (email, password) => {
    if (!supabase) return { error: { message: "Supabase not configured" } };
    return supabase.auth.signInWithPassword({ email, password });
  };
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); };

  const setActiveOrganization = (organizationId) => {
    if (!memberships.some((m) => m.organization_id === organizationId)) return;
    window.localStorage.setItem("touchline-active-organization", organizationId);
    setActiveOrganizationId(organizationId);
  };

  const retryAccess = () => setAccessAttempt((attempt) => attempt + 1);

  const activeMembership = memberships.find((m) => m.organization_id === activeOrganizationId) || null;
  const role = activeMembership?.role || profile?.role || null;
  const value = {
    user,
    profile,
    memberships,
    activeOrganizationId,
    role,
    loading: loading || accessLoading,
    accessError,
    signIn,
    signOut,
    setActiveOrganization,
    retryAccess,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
