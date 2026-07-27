function KimberleyNotesPanel() {
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load(nextFilter) {
    const active = nextFilter != null ? nextFilter : filter;
    setBusy(true);
    setErr("");
    try {
      const q =
        active === "all" ? "" : "?agent=" + encodeURIComponent(active);
      const res = await fetch("/ats/kimberley-notes" + q, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Load failed (" + res.status + ")");
      }
      setNotes(data.notes || []);
    } catch (e) {
      setErr(e.message || "Could not load notes");
    } finally {
      setBusy(false);
    }
  }

  async function markRead(id) {
    await fetch("/ats/kimberley-notes/" + id + "/read", {
      method: "POST",
      credentials: "include",
    });
    load();
  }

  const agents = [
    { id: "all", label: "All" },
    { id: "Maria", label: "Maria" },
    { id: "Michelle", label: "Michelle" },
    { id: "Kelley", label: "Kelley" },
    { id: "Ashton", label: "Ashton" },
  ];

  return (
    <div style={{ maxWidth: 820 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          Kimberley's Notes
        </h2>
        <button
          type="button"
          onClick={function () {
            load();
          }}
          disabled={busy}
          style={{ fontSize: 12, padding: "6px 10px" }}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p style={{ margin: "0 0 14px", color: "#918D80", fontSize: 13, lineHeight: 1.5 }}>
        Status updates from Maria, Michelle, Kelley, and Ashton. These also roll into Gina's morning{" "}
        <strong>Pipeline Stage Counts</strong> briefing. Click <strong>Refresh</strong> to load.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {agents.map(function (a) {
          return (
            <button
              key={a.id}
              type="button"
              onClick={function () {
                setFilter(a.id);
                load(a.id);
              }}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #E6E2D6",
                background: filter === a.id ? "#2C2A24" : "#fff",
                color: filter === a.id ? "#fff" : "#2C2A24",
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {err ? <p style={{ color: "#9B2C2C", fontSize: 13 }}>{err}</p> : null}
      {!notes.length && !busy ? (
        <p style={{ color: "#918D80", fontSize: 13 }}>
          No team updates yet. Ask Gina to command Maria / Michelle / Kelley / Ashton, then Check for
          actions — or click Refresh.
        </p>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {notes.map(function (n) {
          return (
            <li
              key={n.id}
              style={{
                border: "1px solid #E6E2D6",
                borderRadius: 12,
                background: n.status === "unread" ? "#FFFdf7" : "#fff",
                padding: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div>
                  <strong style={{ fontSize: 14 }}>{n.fromAgent}</strong>
                  {n.agentRole ? (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#918D80" }}>
                      {n.agentRole}
                    </span>
                  ) : null}
                </div>
                <span style={{ fontSize: 11, color: "#918D80" }}>
                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                </span>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#5C584C" }}>
                <strong>Ask:</strong> {n.task}
              </p>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  color: "#2C2A24",
                }}
              >
                {n.reply}
              </pre>
              {n.status === "unread" ? (
                <button
                  type="button"
                  onClick={function () {
                    markRead(n.id);
                  }}
                  style={{ marginTop: 10, fontSize: 12, padding: "5px 10px" }}
                >
                  Mark read
                </button>
              ) : (
                <span
                  style={{
                    display: "inline-block",
                    marginTop: 10,
                    fontSize: 11,
                    color: "#918D80",
                  }}
                >
                  Read
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
