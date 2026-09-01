"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { hasSupabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

export default function Login() {
  const { signIn } = useAuth();
  const { mode, toggle } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setErr(error.message);
    else router.push("/admin");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--admin-bg)", color: "var(--admin-text)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative" }}>
      <button type="button" onClick={toggle} aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} className="inline-flex items-center justify-center" style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "var(--admin-control)", color: "var(--admin-text)", border: "1px solid var(--admin-control-border)", cursor: "pointer" }}>
        {mode === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 20, marginBottom: 4 }}><span style={{ color: "#4FC263" }}>⚡</span>Touchline</div>
        <div style={{ color: "var(--admin-dim)", fontSize: 14, marginBottom: 24 }}>Admin & scorer sign in</div>
        {!hasSupabase() && (
          <div style={{ background: "#3a1d1d", color: "#f3b0b0", padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
            Supabase is not configured yet. Add your keys to <code>.env.local</code> and Vercel, then reload.
          </div>
        )}
        <form onSubmit={submit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
            style={inp} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
            style={inp} />
          {err && <div style={{ color: "#F04444", fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#4FC263", color: "#062", fontWeight: 800, cursor: "pointer" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div style={{ color: "var(--admin-faint)", fontSize: 12, marginTop: 16 }}>
          Accounts are created by the admin in the Supabase dashboard (Authentication → Users).
        </div>
      </div>
    </div>
  );
}
const inp = { width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--admin-control-border)", background: "var(--admin-card)", color: "var(--admin-text)", fontSize: 15, marginBottom: 12, outline: "none" };
