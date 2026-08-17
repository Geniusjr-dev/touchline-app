export default function Loading() {
  return <div style={{ minHeight: "100vh", maxWidth: 480, margin: "0 auto", background: "#000" }}>
    <div style={{ height: 56, borderBottom: "1px solid #222" }} />
    <div style={{ height: 132, display: "flex", alignItems: "center", gap: 18, padding: "0 22px" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#171719" }} />
      <div>
        <div style={{ width: 176, height: 18, borderRadius: 6, background: "#171719" }} />
        <div style={{ width: 82, height: 12, borderRadius: 6, background: "#171719", marginTop: 10 }} />
      </div>
    </div>
    <div style={{ height: 48, borderTop: "1px solid #222", borderBottom: "1px solid #222" }} />
  </div>;
}
