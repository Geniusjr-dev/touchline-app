"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { addTeam, listTeams, updateTeamProfile, uploadTeamMedia } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { readableTextColor, TEAM_COLOURS } from "@/lib/teamColors";

export default function Teams() {
  const { activeOrganizationId } = useAuth();
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [short, setShort] = useState("");
  const [color, setColor] = useState(TEAM_COLOURS[0].value);
  const [logoFile, setLogoFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => listTeams(activeOrganizationId).then(setTeams).catch(() => {}), [activeOrganizationId]);
  useEffect(() => { if (activeOrganizationId) load(); }, [activeOrganizationId, load]);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim() || !short.trim()) return;
    if (logoFile && !logoFile.type?.match(/^image\/(jpeg|png|webp)$/)) {
      setErr("Use a JPG, PNG or WebP team logo.");
      return;
    }
    if (logoFile && logoFile.size > 5 * 1024 * 1024) {
      setErr("The team logo must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    setErr("");
    const officialName = name.trim();
    const publicName = displayName.trim() || null;
    const badgeCode = short.trim().toUpperCase().slice(0, 4);
    const { data: createdTeam, error } = await addTeam(activeOrganizationId, officialName, publicName, badgeCode, color);
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }

    if (logoFile && createdTeam) {
      try {
        const logoUrl = await uploadTeamMedia(logoFile, createdTeam.id, "crests");
        const saved = await updateTeamProfile(createdTeam.id, {
          name: officialName,
          display_name: publicName,
          short: badgeCode,
          color,
          country: "Ghana",
          logo_url: logoUrl,
        });
        if (saved.error) throw saved.error;
      } catch (uploadError) {
        setErr(`Team added, but the logo was not saved. ${uploadError.message || "Open the team and try again."}`);
      }
    }

    setName("");
    setDisplayName("");
    setShort("");
    setLogoFile(null);
    await load();
    setBusy(false);
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 6 }}>Teams</h1>
      <p style={{ color: "#8E939B", fontSize: 13, margin: "0 0 16px" }}>Add a team here. Select its card below to manage its profile, squad and trophies on a dedicated page.</p>

      <form onSubmit={submit} style={{ ...card, marginBottom: 20 }}>
        <div style={formRow}>
          <Field label="Official team name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Euphoria Football Club" style={inp} /></Field>
          <Field label="Display name (optional)"><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Euphoria FC" maxLength={40} style={inp} /></Field>
          <Field label="Badge code"><input value={short} onChange={(event) => setShort(event.target.value)} placeholder="EFC" maxLength={4} style={{ ...inp, width: 90, textTransform: "uppercase" }} /></Field>
          <ColourPicker value={color} onChange={setColor} />
          <NewTeamLogoPicker file={logoFile} onChange={setLogoFile} fallback={short.trim().toUpperCase().slice(0, 4) || "FC"} color={color} />
          <button type="submit" disabled={busy} style={btn}>{busy ? "Adding..." : "Add team"}</button>
        </div>
        {err && <div style={{ color: "#F04444", fontSize: 12, marginTop: 10 }}>{err}</div>}
      </form>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {teams.length === 0 && <div style={{ color: "#8E939B", padding: 20, fontSize: 14 }}>No teams yet.</div>}
        {teams.map((team, index) => (
          <Link key={team.id} href={`/admin/teams/${team.id}`} className="flex items-center" style={{ gap: 12, minHeight: 66, padding: "11px 16px", borderTop: index ? "1px solid #26282B" : "none", color: "#FFFFFF" }}>
            <AdminImage src={team.logo_url} fallback={team.short} color={team.color} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="block truncate" style={{ fontSize: 14 }}>{team.name}</span>
              <span className="block truncate" style={{ color: "#8E939B", fontSize: 12, marginTop: 3 }}>{team.display_name || team.country || "Team profile"}</span>
            </span>
            <span className="inline-flex items-center gap-1" style={{ color: "#8E939B", fontSize: 12 }}>Manage <ChevronRight size={17} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ColourPicker({ value, onChange }) {
  return (
    <Field label="Fallback badge colour">
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", maxWidth: 310 }}>
        {TEAM_COLOURS.map((option) => {
          const selected = value?.toUpperCase() === option.value;
          return <button type="button" key={option.value} onClick={() => onChange(option.value)} aria-label={`Use ${option.name.toLowerCase()}`} aria-pressed={selected} title={option.name} style={{ width: 25, height: 25, borderRadius: "50%", background: option.value, border: option.name === "White" ? "1px solid #7A8089" : "1px solid rgba(255,255,255,.20)", outline: selected ? "2px solid #4FC263" : "none", outlineOffset: 2, cursor: "pointer" }} />;
        })}
      </div>
    </Field>
  );
}

function NewTeamLogoPicker({ file, onChange, fallback, color }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <Field label="Team crest"><div style={{ display: "flex", alignItems: "center", gap: 8 }}><AdminImage src={preview} fallback={fallback} color={color} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0] || null)} style={{ color: "#8E939B", fontSize: 11, maxWidth: 180 }} /></div></Field>;
}

function AdminImage({ src, fallback, color = "#30343A" }) {
  return <span style={{ width: 38, height: 38, borderRadius: src ? 0 : "50%", background: src ? "transparent" : color, color: readableTextColor(color), border: src ? 0 : "1px solid rgba(127,127,127,.32)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 11 }}>{src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
  ) : fallback}</span>;
}

function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><span style={{ color: "#8E939B", fontSize: 12 }}>{label}</span>{children}</label>; }

const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const formRow = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" };
const inp = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none", colorScheme: "dark" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#07130B", cursor: "pointer" };
