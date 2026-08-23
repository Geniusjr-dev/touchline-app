"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addPlayer, addTeam, addTeamTrophy, deletePlayer, deleteTeamTrophy, listPlayers,
  listTeams, listTeamTrophies, updatePlayer, updateTeamProfile, updateTeamTrophy,
  uploadTeamMedia,
} from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { groupPlayersByPosition } from "@/lib/playerPositions";
import { readableTextColor, TEAM_COLOURS } from "@/lib/teamColors";

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

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
  const [openTeam, setOpenTeam] = useState(null);

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
    setBusy(true); setErr("");
    const officialName = name.trim();
    const publicName = displayName.trim() || null;
    const badgeCode = short.trim().toUpperCase().slice(0, 4);
    const { data: createdTeam, error } = await addTeam(activeOrganizationId, officialName, publicName, badgeCode, color);
    if (error) { setBusy(false); setErr(error.message); return; }

    let logoError = "";
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
        logoError = `Team added, but the logo was not saved. ${uploadError.message || "Open the team profile and try again."}`;
      }
    }

    setName(""); setDisplayName(""); setShort(""); setLogoFile(null);
    await load();
    setBusy(false);
    if (logoError) setErr(logoError);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Teams, squads & trophies</h1>
      <p style={{ color: "#8E939B", fontSize: 13, margin: "0 0 16px" }}>Everything saved here appears on the public team page.</p>

      <form onSubmit={submit} style={{ ...card, marginBottom: 20 }}>
        <div style={formRow}>
          <Field label="Official team name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Euphoria Football Club" style={inp} /></Field>
          <Field label="Display name (optional)"><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Euphoria FC" maxLength={40} style={inp} /></Field>
          <Field label="Badge code"><input value={short} onChange={(event) => setShort(event.target.value)} placeholder="EFC" maxLength={4} style={{ ...inp, width: 90, textTransform: "uppercase" }} /></Field>
          <ColourPicker value={color} onChange={setColor} />
          <NewTeamLogoPicker file={logoFile} onChange={setLogoFile} fallback={short.trim().toUpperCase().slice(0, 4) || "FC"} color={color} />
          <button type="submit" disabled={busy} style={btn}>{busy ? "Adding…" : "Add team"}</button>
        </div>
        {err && <Message error>{err}</Message>}
      </form>

      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {teams.length === 0 && <div style={{ color: "#8E939B", padding: 20, fontSize: 14 }}>No teams yet.</div>}
        {teams.map((team) => (
          <div key={team.id} style={{ borderTop: "1px solid #26282B" }}>
            <button onClick={() => setOpenTeam(openTeam === team.id ? null : team.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "transparent", color: "#fff", border: "none", cursor: "pointer" }}>
              <AdminImage src={team.logo_url} fallback={team.short} color={team.color} />
              <span style={{ flex: 1, textAlign: "left" }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{team.name}</span>
                <span style={{ display: "block", color: "#8E939B", fontSize: 12, marginTop: 2 }}>{team.display_name || team.country || "Team profile"}</span>
              </span>
              <span style={{ color: "#8E939B", fontSize: 13 }}>{openTeam === team.id ? "Close ▲" : "Edit profile ▼"}</span>
            </button>
            {openTeam === team.id && <TeamWorkspace team={team} refreshTeams={load} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamWorkspace({ team, refreshTeams }) {
  const [section, setSection] = useState("Profile");
  return (
    <div style={{ background: "#101113", borderTop: "1px solid #26282B" }}>
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", overflowX: "auto" }}>
        {["Profile", "Squad", "Trophies"].map((item) => <button key={item} onClick={() => setSection(item)} style={{ ...smallBtn, background: section === item ? "#4FC263" : "#1B1D20", color: section === item ? "#07130B" : "#fff" }}>{item}</button>)}
      </div>
      {section === "Profile" && <TeamEditor team={team} onSaved={refreshTeams} />}
      {section === "Squad" && <Squad teamId={team.id} />}
      {section === "Trophies" && <Trophies teamId={team.id} />}
    </div>
  );
}

function TeamEditor({ team, onSaved }) {
  const [values, setValues] = useState({
    name: team.name || "", display_name: team.display_name || "", short: team.short || "", color: team.color || TEAM_COLOURS[0].value,
    country: team.country || "Ghana", logo_url: team.logo_url || "", coach_name: team.coach_name || "",
    coach_country: team.coach_country || "Ghana", coach_date_of_birth: team.coach_date_of_birth || "", coach_photo_url: team.coach_photo_url || "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  async function upload(file, field, kind) {
    if (!file) return;
    setSaving(true); setMessage("");
    try { set(field, await uploadTeamMedia(file, team.id, kind)); }
    catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function save(event) {
    event.preventDefault();
    if (!values.name.trim() || !values.short.trim()) return;
    setSaving(true); setMessage("");
    const { error } = await updateTeamProfile(team.id, { ...values, name: values.name.trim(), short: values.short.trim().toUpperCase().slice(0, 4) });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Saved"); await onSaved();
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
        <button type="submit" disabled={saving} style={btn}>{saving ? "Saving…" : "Save public profile"}</button>
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
    setBusy(true); setMessage("");
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
    setBusy(true); setMessage("");
    const { error } = await addPlayer(teamId, values.name.trim(), values.number ? Number(values.number) : null, values.position, values);
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setValues({ name: "", display_name: "", number: "", position: "Goalkeeper", country: "Ghana", date_of_birth: "", photo_url: "" }); await load();
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
        <button type="submit" disabled={busy} style={{ ...btn, alignSelf: "end" }}>{busy ? "Saving…" : "Add player"}</button>
      </form>
      {message && <Message error>{message}</Message>}
      <AdminHeading style={{ marginTop: 24 }}>Current squad</AdminHeading>
      {groupPlayersByPosition(players).map((group) => (
        <section key={group.key} style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 7, borderBottom: "1px solid #2A2C30" }}>
            <strong style={{ color: "#FFFFFF", fontSize: 13 }}>{group.label}</strong>
            <span style={{ color: "#8E939B", fontSize: 11, fontWeight: 700 }}>{group.players.length}</span>
          </div>
          {group.players.map((player) => <PlayerEditor key={player.id} player={player} teamId={teamId} refresh={load} />)}
        </section>
      ))}
      {players.length === 0 && <div style={{ color: "#8E939B", fontSize: 12, padding: "10px 0" }}>No players have been added.</div>}
    </div>
  );
}

function PlayerEditor({ player, teamId, refresh }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name: player.name || "", display_name: player.display_name || "", number: player.number ?? "", position: player.position || "Goalkeeper", country: player.country || "Ghana", date_of_birth: player.date_of_birth || "", photo_url: player.photo_url || "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    try { set("photo_url", await uploadTeamMedia(file, teamId, "players")); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!values.name.trim() || !values.display_name.trim()) {
      setMessage("Enter both the full name and lineup display name.");
      return;
    }
    setBusy(true); setMessage("");
    const { error } = await updatePlayer(player.id, { ...values, number: values.number ? Number(values.number) : null });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Saved"); await refresh();
  }
  async function remove() { setBusy(true); await deletePlayer(player.id); await refresh(); }
  return (
    <div style={{ borderTop: "1px solid #26282B", padding: "10px 0" }}>
      <button onClick={() => setOpen((value) => !value)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: 0, color: "#fff", cursor: "pointer", textAlign: "left" }}>
        <AdminImage src={values.photo_url} fallback={String(values.number || "PL")} />
        <span style={{ flex: 1 }}>
          <strong>{values.number ? `${values.number} ` : ""}{values.name}</strong>
          <span style={{ display: "block", color: "#8E939B", fontSize: 12, marginTop: 3 }}>{values.position} · {values.country}</span>
          {values.display_name && <span style={{ display: "block", color: "#6F757E", fontSize: 11, marginTop: 2 }}>Lineup name: {values.display_name}</span>}
        </span>
        <span style={{ color: "#8E939B", fontSize: 12 }}>{open ? "Close ▲" : "Edit ▼"}</span>
      </button>
      {open && <div style={{ ...formGrid, marginTop: 12 }}>
        <Field label="Number"><input type="number" value={values.number} onChange={(event) => set("number", event.target.value)} style={inp} /></Field>
        <Field label="Full name"><input required value={values.name} onChange={(event) => set("name", event.target.value)} style={inp} /></Field>
        <Field label="Lineup display name"><input required value={values.display_name} onChange={(event) => set("display_name", event.target.value)} placeholder="Short name" maxLength={24} style={inp} /></Field>
        <Field label="Position"><PositionSelect value={values.position} onChange={(value) => set("position", value)} /></Field>
        <Field label="Country"><input value={values.country} onChange={(event) => set("country", event.target.value)} style={inp} /></Field>
        <Field label="Date of birth"><input type="date" value={values.date_of_birth} onChange={(event) => set("date_of_birth", event.target.value)} style={inp} /></Field>
        <ImageUpload label="Photo" src={values.photo_url} onFile={upload} fallback="PL" />
        <div style={{ ...formRow, alignSelf: "end" }}><button onClick={save} disabled={busy} style={btn}>Save</button><button onClick={remove} disabled={busy} style={dangerBtn}>Remove</button></div>
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
  async function upload(file) {
    if (!file) return;
    setBusy(true);
    try { set("image_url", await uploadTeamMedia(file, teamId, "trophies")); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function add(event) {
    event.preventDefault();
    if (!values.name.trim()) return;
    setBusy(true); setMessage("");
    const { error } = await addTeamTrophy(teamId, { ...values, name: values.name.trim() });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setValues({ name: "", season: "", won_on: "", image_url: "" }); await load();
  }
  return (
    <div style={editor}>
      <AdminHeading>Add trophy</AdminHeading>
      <form onSubmit={add} style={formGrid}>
        <Field label="Trophy name"><input value={values.name} onChange={(event) => set("name", event.target.value)} placeholder="District Champions" style={inp} /></Field>
        <Field label="Season"><input value={values.season} onChange={(event) => set("season", event.target.value)} placeholder="2025/26" style={inp} /></Field>
        <Field label="Date won"><input type="date" value={values.won_on} onChange={(event) => set("won_on", event.target.value)} style={inp} /></Field>
        <ImageUpload label="Trophy image" src={values.image_url} onFile={upload} fallback="🏆" />
        <button type="submit" disabled={busy} style={{ ...btn, alignSelf: "end" }}>{busy ? "Saving…" : "Add trophy"}</button>
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
  async function remove() { setBusy(true); await deleteTeamTrophy(trophy.id); await refresh(); }
  return (
    <div style={{ ...formGrid, borderTop: "1px solid #26282B", padding: "12px 0" }}>
      <Field label="Name"><input value={values.name} onChange={(event) => set("name", event.target.value)} style={inp} /></Field>
      <Field label="Season"><input value={values.season} onChange={(event) => set("season", event.target.value)} style={inp} /></Field>
      <Field label="Date won"><input type="date" value={values.won_on} onChange={(event) => set("won_on", event.target.value)} style={inp} /></Field>
      <ImageUpload label="Image" src={values.image_url} onFile={upload} fallback="🏆" />
      <div style={{ ...formRow, alignSelf: "end" }}><button onClick={save} disabled={busy} style={btn}>Save</button><button onClick={remove} disabled={busy} style={dangerBtn}>Remove</button></div>
    </div>
  );
}

function ColourPicker({ value, onChange }) {
  return (
    <Field label="Fallback badge colour">
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", maxWidth: 310 }}>
        {TEAM_COLOURS.map((option) => {
          const selected = value?.toUpperCase() === option.value;
          return (
            <button
              type="button"
              key={option.value}
              onClick={() => onChange(option.value)}
              aria-label={`Use ${option.name.toLowerCase()}`}
              aria-pressed={selected}
              title={option.name}
              style={{
                width: 25,
                height: 25,
                borderRadius: "50%",
                background: option.value,
                border: option.name === "White" ? "1px solid #7A8089" : "1px solid rgba(255,255,255,.20)",
                outline: selected ? "2px solid #4FC263" : "none",
                outlineOffset: 2,
                cursor: "pointer",
              }}
            />
          );
        })}
      </div>
    </Field>
  );
}

function PositionSelect({ value, onChange }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} style={inp}>{POSITIONS.map((position) => <option key={position}>{position}</option>)}</select>;
}

function NewTeamLogoPicker({ file, onChange, fallback, color }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return undefined; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <Field label="Team crest">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AdminImage src={preview} fallback={fallback} color={color} />
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onChange(event.target.files?.[0] || null)} style={{ color: "#8E939B", fontSize: 11, maxWidth: 180 }} />
      </div>
    </Field>
  );
}

function ImageUpload({ label, src, onFile, onRemove, fallback, color }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <AdminImage src={src} fallback={fallback} color={color} />
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onFile(event.target.files?.[0])} style={{ color: "#8E939B", fontSize: 11, maxWidth: 180 }} />
        {src && onRemove && <button type="button" onClick={onRemove} style={{ ...dangerBtn, padding: "7px 9px", fontSize: 11 }}>Remove</button>}
      </div>
    </Field>
  );
}

function AdminImage({ src, fallback, color = "#30343A" }) {
  return <span style={{ width: 38, height: 38, borderRadius: src ? 0 : "50%", background: src ? "transparent" : color, color: readableTextColor(color), border: src ? 0 : "1px solid rgba(127,127,127,.32)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 11, fontWeight: 850 }}>{src ? (
    // Supabase public media URLs are administrator-controlled team assets.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
  ) : fallback}</span>;
}

function AdminHeading({ children, style }) { return <div style={{ fontSize: 14, fontWeight: 850, marginBottom: 12, ...style }}>{children}</div>; }
function Field({ label, children }) { return <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><span style={{ color: "#8E939B", fontSize: 12, fontWeight: 650 }}>{label}</span>{children}</label>; }
function Message({ children, error = false }) { return <span style={{ color: error ? "#F04444" : "#4FC263", fontSize: 12, marginTop: 8 }}>{children}</span>; }

const card = { background: "#161719", border: "1px solid #26282B", borderRadius: 14, padding: 16 };
const editor = { padding: "8px 16px 18px" };
const formRow = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" };
const inp = { width: "100%", minWidth: 0, boxSizing: "border-box", padding: 10, borderRadius: 9, border: "1px solid #2A2C30", background: "#0E0F11", color: "#fff", fontSize: 14, outline: "none", colorScheme: "dark" };
const btn = { padding: "10px 16px", borderRadius: 9, border: "none", background: "#4FC263", color: "#07130B", fontWeight: 850, cursor: "pointer" };
const smallBtn = { padding: "7px 13px", borderRadius: 999, border: "1px solid #2A2C30", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const dangerBtn = { ...btn, background: "#2A1A1A", color: "#F87070", border: "1px solid #5A2929" };
