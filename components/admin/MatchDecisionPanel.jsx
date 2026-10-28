"use client";

import { useEffect, useState } from "react";

const ACTIONS = [
  { id: "reset", label: "Reset accidental kickoff", tone: "#F5C518" },
  { id: "award", label: "Award result", tone: "#4FC263" },
  { id: "postpone", label: "Postpone match", tone: "#8EB5FF" },
  { id: "cancel", label: "Cancel match", tone: "#F06A6A" },
];

function defaultForm(match) {
  return {
    reason: "",
    winnerSide: "home",
    homeScore: "3",
    awayScore: "0",
    matchDate: match?.match_date || "",
    kickoff: match?.kickoff || "",
  };
}

export default function MatchDecisionPanel({ match, home, away, busy, onSubmit }) {
  const [action, setAction] = useState("");
  const [form, setForm] = useState(() => defaultForm(match));

  useEffect(() => {
    setForm(defaultForm(match));
    setAction("");
  }, [match]);

  const unavailable = ["cancelled", "postponed"].includes(match.status);
  const actionOptions = unavailable
    ? [{ id: "reschedule", label: "Restore as scheduled", tone: "#4FC263" }]
    : ACTIONS.filter((item) => item.id !== "reset" || match.status !== "scheduled");

  function selectWinner(side) {
    setForm((current) => ({
      ...current,
      winnerSide: side,
      homeScore: side === "home" ? "3" : "0",
      awayScore: side === "away" ? "3" : "0",
    }));
  }

  async function submit(event) {
    event.preventDefault();
    const labels = {
      reset: "reset this match and permanently remove its recorded events and statistics",
      award: "publish this awarded result",
      postpone: "mark this match as postponed",
      cancel: "cancel this match",
      reschedule: "restore this fixture as scheduled",
    };
    if (!window.confirm(`Confirm that you want to ${labels[action]}?`)) return;
    const succeeded = await onSubmit(action, form);
    if (succeeded) setAction("");
  }

  return (
    <section style={panelStyle}>
      <div style={{ color: "#FFFFFF", fontSize: 13, fontWeight: 850, letterSpacing: ".04em" }}>ADMINISTRATIVE MATCH CONTROL</div>
      <div style={{ color: "#AAB0BA", fontSize: 12, lineHeight: 1.5, marginTop: 5 }}>
        These decisions are restricted to administrators and recorded in the audit log.
      </div>

      {match.decision_reason && ["awarded", "cancelled", "postponed"].includes(match.status) && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 9, background: "#111315", color: "#D7DADE", fontSize: 12 }}>
          <strong style={{ textTransform: "capitalize" }}>{match.status}:</strong> {match.decision_reason}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 8, marginTop: 14 }}>
        {actionOptions.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setAction((current) => current === item.id ? "" : item.id);
              setForm(defaultForm(match));
            }}
            style={{ ...actionButton, borderColor: action === item.id ? item.tone : "#34373C", color: item.tone }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {action && (
        <form onSubmit={submit} style={{ marginTop: 14, borderTop: "1px solid #34373C", paddingTop: 14 }}>
          {action === "award" && (
            <>
              <Field label="Team receiving the win">
                <select value={form.winnerSide} onChange={(event) => selectWinner(event.target.value)} style={inputStyle}>
                  <option value="home">{home.name}</option>
                  <option value="away">{away.name}</option>
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <Field label={`${home.name} score`}><input type="number" min="0" value={form.homeScore} onChange={(event) => setForm((current) => ({ ...current, homeScore: event.target.value }))} required style={inputStyle} /></Field>
                <Field label={`${away.name} score`}><input type="number" min="0" value={form.awayScore} onChange={(event) => setForm((current) => ({ ...current, awayScore: event.target.value }))} required style={inputStyle} /></Field>
              </div>
            </>
          )}

          {["postpone", "reschedule"].includes(action) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <Field label={action === "postpone" ? "New date (optional)" : "Match date"}><input type="date" value={form.matchDate} onChange={(event) => setForm((current) => ({ ...current, matchDate: event.target.value }))} style={inputStyle} /></Field>
              <Field label={action === "postpone" ? "New time (optional)" : "Kick-off time"}><input type="time" value={form.kickoff} onChange={(event) => setForm((current) => ({ ...current, kickoff: event.target.value }))} style={inputStyle} /></Field>
            </div>
          )}

          <Field label="Reason">
            <textarea
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              required
              minLength={5}
              maxLength={240}
              rows={3}
              placeholder="Give a short reason for this decision"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          {action === "reset" && <div style={warningStyle}>Resetting permanently removes recorded events and match statistics. Saved lineups remain available.</div>}
          {action === "cancel" && <div style={warningStyle}>A cancelled league match will not affect played matches, points, goals, form or player statistics.</div>}
          {action === "award" && <div style={warningStyle}>The awarded score will count in the table, but no player will receive a goal, assist, appearance or card.</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={busy || form.reason.trim().length < 5} style={{ ...confirmButton, opacity: busy || form.reason.trim().length < 5 ? 0.5 : 1 }}>{busy ? "Saving..." : "Confirm decision"}</button>
            <button type="button" disabled={busy} onClick={() => setAction("")} style={cancelButton}>Close</button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return <label style={{ display: "grid", gap: 6, color: "#AAB0BA", fontSize: 11.5, marginBottom: 10 }}><span>{label}</span>{children}</label>;
}

const panelStyle = { background: "#1B1D20", border: "1px solid #34373C", borderRadius: 13, padding: 14, marginBottom: 12 };
const actionButton = { minHeight: 44, borderRadius: 10, border: "1px solid", background: "#0E0F11", padding: "9px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer" };
const inputStyle = { width: "100%", minHeight: 42, borderRadius: 9, border: "1px solid #3A3D42", background: "#101113", color: "#FFFFFF", padding: "9px 10px", fontSize: 13 };
const warningStyle = { color: "#F4D67B", background: "#2B2410", border: "1px solid #51451D", borderRadius: 9, padding: 9, fontSize: 11.5, lineHeight: 1.45 };
const confirmButton = { minHeight: 42, border: 0, borderRadius: 9, background: "#4FC263", color: "#06270D", padding: "0 14px", fontSize: 12, fontWeight: 850, cursor: "pointer" };
const cancelButton = { minHeight: 42, border: "1px solid #3A3D42", borderRadius: 9, background: "#101113", color: "#FFFFFF", padding: "0 14px", fontSize: 12, fontWeight: 750, cursor: "pointer" };
