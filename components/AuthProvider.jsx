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
  signIn: async () => {},
  signOut: async () => {},
  setActiveOrganization: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState(null);

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
      return;
    }
    setAccessLoading(true);
    getMyAccess(user.id)
      .then(({ profile: nextProfile, memberships: nextMemberships }) => {
        if (!alive) return;
        setProfile(nextProfile);
        setMemberships(nextMemberships);
        const saved = window.localStorage.getItem("touchline-active-organization");
        const selected = nextMemberships.some((m) => m.organization_id === saved)
          ? saved
          : nextMemberships[0]?.organization_id || null;
        setActiveOrganizationId(selected);
      })
      .catch(() => {
        if (!alive) return;
        setProfile(null);
        setMemberships([]);
        setActiveOrganizationId(null);
      })
      .finally(() => { if (alive) setAccessLoading(false); });
    return () => { alive = false; };
  }, [user]);

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

  const activeMembership = memberships.find((m) => m.organization_id === activeOrganizationId) || null;
  const role = activeMembership?.role || profile?.role || null;
  const value = {
    user,
    profile,
    memberships,
    activeOrganizationId,
    role,
    loading: loading || accessLoading,
    signIn,
    signOut,
    setActiveOrganization,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
