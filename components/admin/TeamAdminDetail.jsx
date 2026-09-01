"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  addPlayer,
  addTeamTrophy,
  deletePlayer,
  deleteTeamTrophy,
  listPlayers,
  listTeams,
  listTeamTrophies,
  updatePlayer,
  updateTeamProfile,
  updateTeamTrophy,
  uploadTeamMedia,
} from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { groupPlayersByPosition } from "@/lib/playerPositions";
import { readableTextColor, TEAM_COLOURS } from "@/lib/teamColors";

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

export default function TeamAdminDetail({ id }) {
  const { activeOrganizationId } = useAuth();
  const [team, setTeam] = useState(null);
  const [section, setSection] = useState("Profile");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const teams = await listTeams(activeOrganizationId);
      const selectedTeam = teams.find((entry) => entry.id === id) || null;
      setTeam(selectedTeam);
      setLoadError(selectedTeam ? "" : "This team could not be found.");
    } catch (error) {
      setLoadError(error.message || "This team could not be loaded.");
    }
  }, [activeOrganizationId, id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center gap-3" style={{ marginBottom: 18 }}>
        <Link href="/admin/teams" aria-label="Back to teams" className="inline-flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--admin-elevated)", border: "1px solid var(--admin-control-border)" }}><ChevronLeft size={20} /></Link>
        <span style={{ minWidth: 0, flex: 1 }}>
          <h1 className="truncate" style={{ fontSize: 20, margin: 0 }}>{team?.name || "Team management"}</h1>
          <span className="block truncate" style={{ color: "var(--admin-dim)", fontSize: 12, marginTop: 3 }}>{team ? "Profile, squad and trophies" : "Loading team"}</span>
        </span>
      </div>

      {loadError && <div style={{ ...card, color: "#F04444" }}>{loadError}</div>}
      {!team && !loadError && <div className="touchline-skeleton" style={{ ...card, height: 220 }} />}
      {team && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div className="flex items-center gap-3" style={{ padding: "16px", borderBottom: "1px solid var(--admin-divider)" }}>
            <AdminImage src={team.logo_url} fallback={team.short} color={team.color} size={48} />
            <span style={{ minWidth: 0 }}>
              <span className="block truncate" style={{ fontSize: 15 }}>{team.name}</span>
              <span className="block truncate" style={{ color: "var(--admin-dim)", fontSize: 12, marginTop: 3 }}>{team.display_name || team.country || "Ghana"}</span>
            </span>
          </div>
          <div className="flex gap-8 overflow-x-auto no-scrollbar" style={{ padding: "0 16px", borderBottom: "1px solid var(--admin-divider)" }}>
            {["Profile", "Squad", "Trophies"].map((item) => <button key={item} type="button" onClick={() => setSection(item)} style={{ position: "relative", height: 46, color: section === item ? "var(--admin-text)" : "var(--admin-dim)", background: "transparent", border: 0, fontSize: 13, cursor: "pointer" }}>{item}{section === item && <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, borderRadius: 3, background: "#4FC263" }} />}</button>)}
          </div>
          {section === "Profile" && <TeamEditor team={team} onSaved={load} />}
          {section === "Squad" && <Squad teamId={team.id} />}
          {section === "Trophies" && <Trophies teamId={team.id} />}
        </div>
      )}
    </div>
  );
}

function TeamEditor({ team, onSaved }) {
  const [values, setValues] = useState({
    name: team.name || "",
    display_name: team.display_name || "",
    short: team.short || "",
    color: team.color || TEAM_COLOURS[0].value,
    country: team.country || "Ghana",
    logo_url: team.logo_url || "",
    coach_name: team.coach_name || "",
    coach_country: team.coach_country || "Ghana",
    coach_date_of_birth: team.coach_date_of_birth || "",
    coach_photo_url: team.coach_photo_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  async function upload(file, field, kind) {
    if (!file) return;
    setSaving(true);
    setMessage("");
    try { set(field, await uploadTeamMedia(file, team.id, kind)); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function save(event) {
    event.preventDefault();
    if (!values.name.trim() || !values.short.trim()) return;
    setSaving(true);
    setMessage("");
    const { error } = await updateTeamProfile(team.id, { ...values, name: values.name.trim(), short: values.short.trim().toUpperCase().slice(0, 4) });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Saved");
    await onSaved();
  }

  return (
    <form onSubmit={save} style={editor}>
      <AdminHeading>Team identity</AdminHeading>
      <div style={formGrid}>
        <Field label="Official name"><input value={values.name} onChange={(event) => set("name", event.target.value)} style={inp} /></Field>
        <Field label="Display name"><input value={values.display_name} onChange={(event) => set("display_name", event.target.value)} placeholder="Shorter public name" maxLength={40} style={inp} /></Field>
        <Field label="Country"><input value={values.country} onChange={(event) => set("country", event.target.value)} style={inp} /></Field>
        <Field label="Badge code"><input value={values.short} onChange={(event) => set("short", event.target.value)} maxLength={4} style={{ ...inp, textTransform: "uppercase" }} /></Field>
      </div>
      <div style={{ ...formRow, marginTop: 12 }}>
        <ColourPicker value={values.color} onChange={(value) => set("color", value)} />
        <ImageUpload label="Team crest" src={values.logo_url} onFile={(file) => upload(file, "logo_url", "crests")} onRemove={() => set("logo_url", "")} fallback={values.short} color={values.color} />
      </div>

      <AdminHeading style={{ marginTop: 22 }}>Coach</AdminHeading>
      <div style={formGrid}>
        <Field label="Coach name"><input value={values.coach_name} onChange={(event) => set("coach_name", event.target.value)} placeholder="Full name" style={inp} /></Field>
        <Field label="Country"><input value={values.coach_country} onChange={(event) => set("coach_country", event.target.value)} style={inp} /></Field>
        <Field label="Date of birth"><input type="date" value={values.coach_date_of_birth} onChange={(event) => set("coach_date_of_birth", event.target.value)} style={inp} /></Field>
        <ImageUpload label="Coach photo" src={values.coach_photo_url} onFile={(file) => upload(file, "coach_photo_url", "coaches")} fallback="CO" />
      </div>
      <div style={{ ...formRow, marginTop: 16 }}>
        <button type="submit" disabled={saving} style={btn}>{saving ? "Saving..." : "Save public profile"}</button>
        {message && <Message error={message !== "Saved"}>{message}</Message>}
      </div>
    </form>
  );
}

function Squad({ teamId }) {
  const [players, setPlayers] = useState([]);
  const [values, setValues] = useState({ name: "", display_name: "", number: "", position: "Goalkeeper", country: "Ghana", date_of_birth: "", photo_url: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => listPlayers(teamId).then(setPlayers).catch(() => {}), [teamId]);
  useEffect(() => { load(); }, [load]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  async function upload(file) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try { set("photo_url", await uploadTeamMedia(file, teamId, "players")); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function add(event) {
    event.preventDefault();
    if (!values.name.trim() || !values.display_name.trim()) {
      setMessage("Enter both the full name and lineup display name.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await addPlayer(teamId, values.name.trim(), values.number ? Number(values.number) : null, values.position, values);
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setValues({ name: "", display_name: "", number: "", position: "Goalkeeper", country: "Ghana", date_of_birth: "", photo_url: "" });
    await load();
  }

  return (
    <div style={editor}>
      <AdminHeading>Add player</AdminHeading>
      <form onSubmit={add} style={formGrid}>
        <Field label="Squad number"><input type="number" value={values.number} onChange={(event) => set("number", event.target.value)} style={inp} /></Field>
        <Field label="Full name"><input required value={values.name} onChange={(event) => set("name", event.target.value)} placeholder="Official player name" style={inp} /></Field>
        <Field label="Lineup display name"><input required value={values.display_name} onChange={(event) => set("display_name", event.target.value)} placeholder="Short name, such as Mensah" maxLength={24} style={inp} /></Field>
        <Field label="Position"><PositionSelect value={values.position} onChange={(value) => set("position", value)} /></Field>
        <Field label="Country"><input value={values.country} onChange={(event) => set("country", event.target.value)} style={inp} /></Field>
        <Field label="Date of birth"><input type="date" value={values.date_of_birth} onChange={(event) => set("date_of_birth", event.target.value)} style={inp} /></Field>
        <ImageUpload label="Player photo" src={values.photo_url} onFile={upload} fallback="PL" />
        <button type="submit" disabled={busy} style={{ ...btn, alignSelf: "end" }}>{busy ? "Saving..." : "Add player"}</button>
      </form>
      {message && <Message error>{message}</Message>}
      <AdminHeading style={{ marginTop: 24 }}>Current squad</AdminHeading>
      {groupPlayersByPosition(players).map((group) => (
        <section key={group.key} style={{ marginTop: 18 }}>
          <div className="flex items-center justify-between" style={{ gap: 12, paddingBottom: 7, borderBottom: "1px solid var(--admin-control-border)" }}><span style={{ color: "var(--admin-text)", fontSize: 13 }}>{group.label}</span><span style={{ color: "var(--admin-dim)", fontSize: 11 }}>{group.players.length}</span></div>
          {group.players.map((player) => <PlayerEditor key={player.id} player={player} teamId={teamId} refresh={load} />)}
        </section>
      ))}
      {players.length === 0 && <div style={{ color: "var(--admin-dim)", fontSize: 12, padding: "10px 0" }}>No players have been added.</div>}
    </div>
  );
}

function PlayerEditor({ player, teamId, refresh }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name: player.name || "", display_name: player.display_name || "", number: player.number ?? "", position: player.position || "Goalkeeper", country: player.country || "Ghana", date_of_birth: player.date_of_birth || "", photo_url: player.photo_url || "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  async function upload(file) { if (!file) return; setBusy(true); try { set("photo_url", await uploadTeamMedia(file, teamId, "players")); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  async function save() { if (!values.name.trim() || !values.display_name.trim()) { setMessage("Enter both the full name and lineup display name."); return; } setBusy(true); setMessage(""); const { error } = await updatePlayer(player.id, { ...values, number: values.number ? Number(values.number) : null }); setBusy(false); if (error) { setMessage(error.message); return; } setMessage("Saved"); await refresh(); }
  async function remove() { if (!window.confirm(`Remove ${values.name} from this squad?`)) return; setBusy(true); await deletePlayer(player.id); await refresh(); }
  return (
    <div style={{ borderTop: "1px solid var(--admin-divider)", padding: "10px 0" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="w-full flex items-center" style={{ gap: 10, background: "none", border: 0, color: "var(--admin-text)", cursor: "pointer", textAlign: "left" }}><AdminImage src={values.photo_url} fallback={String(values.number || "PL")} /><span style={{ flex: 1 }}><span>{values.number ? `${values.number} ` : ""}{values.name}</span><span className="block" style={{ color: "var(--admin-dim)", fontSize: 12, marginTop: 3 }}>{values.position} · {values.country}</span><span className="block" style={{ color: "var(--admin-faint)", fontSize: 11, marginTop: 2 }}>Lineup name: {values.display_name}</span></span><span style={{ color: "var(--admin-dim)", fontSize: 12 }}>{open ? "Close" : "Edit"}</span></button>
      {open && <div style={{ ...formGrid, marginTop: 12 }}>
        <Field label="Number"><input type="number" value={values.number} onChange={(event) => set("number", event.target.value)} style={inp} /></Field>
        <Field label="Full name"><input required value={values.name} onChange={(event) => set("name", event.target.value)} style={inp} /></Field>
        <Field label="Lineup display name"><input required value={values.display_name} onChange={(event) => set("display_name", event.target.value)} placeholder="Short name" maxLength={24} style={inp} /></Field>
        <Field label="Position"><PositionSelect value={values.position} onChange={(value) => set("position", value)} /></Field>
        <Field label="Country"><input value={values.country} onChange={(event) => set("country", event.target.value)} style={inp} /></Field>
        <Field label="Date of birth"><input type="date" value={values.date_of_birth} onChange={(event) => set("date_of_birth", event.target.value)} style={inp} /></Field>
        <ImageUpload label="Photo" src={values.photo_url} onFile={upload} fallback="PL" />
        <div style={{ ...formRow, alignSelf: "end" }}><button type="button" onClick={save} disabled={busy} style={btn}>Save</button><button type="button" onClick={remove} disabled={busy} style={dangerBtn}>Remove</button></div>
        {message && <Message error={message !== "Saved"}>{message}</Message>}
      </div>}
    </div>
  );
}

function Trophies({ teamId }) {
  const [trophies, setTrophies] = useState([]);
  const [values, setValues] = useState({ name: "", season: "", won_on: "", image_url: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => listTeamTrophies(teamId).then(setTrophies).catch(() => {}), [teamId]);
  useEffect(() => { load(); }, [load]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  async function upload(file) { if (!file) return; setBusy(true); try { set("image_url", await uploadTeamMedia(file, teamId, "trophies")); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  async function add(event) { event.preventDefault(); if (!values.name.trim()) return; setBusy(true); setMessage(""); const { error } = await addTeamTrophy(teamId, { ...values, name: values.name.trim() }); setBusy(false); if (error) { setMessage(error.message); return; } setValues({ name: "", season: "", won_on: "", image_url: "" }); await load(); }
  return (
    <div style={editor}>
      <AdminHeading>Add trophy</AdminHeading>
      <form onSubmit={add} style={formGrid}>
        <Field label="Trophy name"><input value={values.name} onChange={(event) => set("name", event.target.value)} placeholder="District Champions" style={inp} /></Field>
        <Field label="Season"><input value={values.season} onChange={(event) => set("season", event.target.value)} placeholder="2025/26" style={inp} /></Field>
        <Field label="Date won"><input type="date" value={values.won_on} onChange={(event) => set("won_on", event.target.value)} style={inp} /></Field>
        <ImageUpload label="Trophy image" src={values.image_url} onFile={upload} fallback="🏆" />
        <button type="submit" disabled={busy} style={{ ...btn, alignSelf: "end" }}>{busy ? "Saving..." : "Add trophy"}</button>
      </form>
      {message && <Message error>{message}</Message>}
      <AdminHeading style={{ marginTop: 24 }}>Trophy cabinet</AdminHeading>
      {trophies.map((trophy) => <TrophyEditor key={trophy.id} trophy={trophy} teamId={teamId} refresh={load} />)}
    </div>
  );
}

function TrophyEditor({ trophy, teamId, refresh }) {
  const [values, setValues] = useState({ name: trophy.name || "", season: trophy.season || "", won_on: trophy.won_on || "", image_url: trophy.image_url || "" });
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  async function upload(file) { if (!file) return; setBusy(true); try { set("image_url", await uploadTeamMedia(file, teamId, "trophies")); } finally { setBusy(false); } }
  async function save() { setBusy(true); await updateTeamTrophy(trophy.id, values); setBusy(false); await refresh(); }
  async function remove() { if (!window.confirm(`Remove ${values.name} from the trophy cabinet?`)) return; setBusy(true); await deleteTeamTrophy(trophy.id); await refresh(); }
  return <div style={{ ...formGrid, borderTop: "1px solid var(--admin-divider)", padding: "12px 0" }}><Field label="Name"><input value={values.name} onChange={(event) => set("name", event.target.value)} style={inp} /></Field><Field label="Season"><input value={values.season} onChange={(event) => set("season", event.target.value)} style={inp} /></Field><Field label="Date won"><input type="date" value={values.won_on} onChange={(event) => set("won_on", event.target.value)} style={inp} /></Field><ImageUpload label="Image" src={values.image_url} onFile={upload} fallback="🏆" /><div style={{ ...formRow, alignSelf: "end" }}><button type="button" onClick={save} disabled={busy} style={btn}>Save</button><button type="button" onClick={remove} disabled={busy} style={dangerBtn}>Remove</button></div></div>;
}

function ColourPicker({ value, onChange }) {
  return <Field label="Fallback badge colour"><div style={{ display: "flex", gap: 7, flexWrap: "wrap", maxWidth: 310 }}>{TEAM_COLOURS.map((option) => { const selected = value?.toUpperCase() === option.value; return <button type="button" key={option.value} onClick={() => onChange(option.value)} aria-label={`Use ${option.name.toLowerCase()}`} aria-pressed={selected} title={option.name} style={{ width: 25, height: 25, borderRadius: "50%", background: option.value, border: option.name === "White" ? "1px solid #7A8089" : "1px solid rgba(255,255,255,.20)", outline: selected ? "2px solid #4FC263" : "none", outlineOffset: 2, cursor: "pointer" }} />; })}</div></Field>;
}

function PositionSelect({ value, onChange }) { return <select value={value} onChange={(event) => onChange(event.target.value)} style={inp}>{POSITIONS.map((position) => <option key={position}>{position}</option>)}</select>; }

function ImageUpload({ label, src, onFile, onRemove, fallback, color }) {
  return <Field label={label}><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><AdminImage src={src} fallback={fallback} color={color} /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files?.[0])} style={{ color: "var(--admin-dim)", fontSize: 11, maxWidth: 180 }} />{src && onRemove && <button type="button" onClick={onRemove} style={{ ...dangerBtn, padding: "7px 9px", fontSize: 11 }}>Remove</button>}</div></Field>;
}

function AdminImage({ src, fallback, color = "#30343A", size = 38 }) {
  return <span style={{ width: size, height: size, borderRadius: src ? 0 : "50%", background: src ? "transparent" : color, color: readableTextColor(color), border: src ? 0 : "1px solid rgba(127,127,127,.32)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 11 }}>{src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
  ) : fallback}</span>;
}

function AdminHeading({ children, style }) { return <div style={{ fontSize: 14, marginBottom: 12, ...style }}>{children}</div>; }
function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><span style={{ color: "var(--admin-dim)", fontSize: 12 }}>{label}</span>{children}</label>; }
function Message({ children, error = false }) { return <span style={{ color: error ? "#F04444" : "#4FC263", fontSize: 12, marginTop: 8 }}>{children}</span>; }

const card = { background: "var(--admin-card)", border: "1px solid var(--admin-divider)", borderRadius: 14, padding: 16 };
const editor = { padding: "18px 16px" };
const formRow = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" };
const inp = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid var(--admin-control-border)", background: "var(--admin-input)", color: "var(--admin-text)", fontSize: 14, outline: "none", colorScheme: "inherit" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#07130B", cursor: "pointer" };
const dangerBtn = { ...btn, background: "var(--admin-soft-danger)", color: "var(--admin-danger-text)", border: "1px solid #5A2929" };
