export default function Slide06Console() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#1A1B26",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        color: "#C0CAF5",
      }}
    >
      {/* Left Sidebar */}
      <div
        style={{
          width: "22vw",
          height: "100vh",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          padding: "5vh 3vw",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "6vh" }}>
          <div style={{ width: "1.5vw", height: "1.5vw", backgroundColor: "#7AA2F7", borderRadius: "0.3vw" }} />
          <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#FFFFFF" }}>BERAHOST</div>
        </div>

        <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#565F89", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2vh" }}>
          Overview
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh", marginBottom: "4vh" }}>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Introduction</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>The Problem</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Bot Marketplace</div>
        </div>

        <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#565F89", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2vh" }}>
          Features
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Deployment Engine</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Session Persistence</div>
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Live Console
          </div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Plans & Economy</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Stack</div>
        </div>

        <div style={{ marginTop: "auto", fontSize: "0.8vw", color: "#565F89" }}>v1.0.0 · 2026</div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          padding: "8vh 6vw",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        <div style={{ fontSize: "1vw", color: "#7AA2F7", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "2vh" }}>
          Observability
        </div>

        <h1
          style={{
            fontSize: "4.5vw",
            fontWeight: 800,
            color: "#FFFFFF",
            margin: "0 0 1.5vh 0",
            letterSpacing: "-0.03em",
          }}
        >
          Live Console
        </h1>

        <p
          style={{
            fontSize: "1.4vw",
            color: "#9AA5CE",
            lineHeight: 1.6,
            maxWidth: "44vw",
            margin: "0 0 3vh 0",
          }}
        >
          Real-time visibility into every running bot.
        </p>

        <div style={{ display: "flex", gap: "3vw", maxWidth: "54vw" }}>
          <div style={{ flex: 1.4 }}>
            <div
              style={{
                backgroundColor: "#16161E",
                borderRadius: "0.5vw",
                border: "1px solid rgba(255,255,255,0.05)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1.5vh 1.5vw",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ fontSize: "0.95vw", color: "#FFFFFF", fontWeight: 600 }}>dep_xyz789 — stdout</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5vw" }}>
                  <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#9ECE6A", borderRadius: "50%" }} />
                  <div style={{ fontSize: "0.85vw", fontFamily: "'DM Mono', monospace", color: "#9ECE6A" }}>running</div>
                </div>
              </div>
              <div style={{ padding: "2vh 1.5vw", fontFamily: "'DM Mono', monospace", fontSize: "0.9vw", lineHeight: 1.8 }}>
                <div style={{ color: "#565F89" }}>10:42:01</div>
                <div style={{ color: "#9ECE6A", marginTop: "0.3vh" }}>  [WA] Connected as +62812xxxxxxxx</div>
                <div style={{ color: "#565F89", marginTop: "0.3vh" }}>10:42:04</div>
                <div style={{ color: "#C0CAF5", marginTop: "0.3vh" }}>  [BOT] Received: !help from group</div>
                <div style={{ color: "#565F89", marginTop: "0.3vh" }}>10:42:04</div>
                <div style={{ color: "#7AA2F7", marginTop: "0.3vh" }}>  [BOT] Replied: help menu sent</div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.85vw", color: "#565F89", marginBottom: "0.8vh" }}>CPU</div>
              <div style={{ fontSize: "2.5vw", fontWeight: 700, color: "#7AA2F7", fontFamily: "'DM Mono', monospace" }}>3.2<span style={{ fontSize: "1vw", color: "#9AA5CE" }}>%</span></div>
            </div>
            <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.85vw", color: "#565F89", marginBottom: "0.8vh" }}>RAM (RSS)</div>
              <div style={{ fontSize: "2.5vw", fontWeight: 700, color: "#9ECE6A", fontFamily: "'DM Mono', monospace" }}>148<span style={{ fontSize: "1vw", color: "#9AA5CE" }}>MB</span></div>
            </div>
            <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "0.85vw", color: "#565F89", marginBottom: "0.8vh" }}>Log Export</div>
              <div style={{ fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", color: "#E0AF68" }}>.txt</span>
                <span style={{ color: "#565F89", margin: "0 0.5vw" }}>/</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: "#E0AF68" }}>.json</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>06</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
