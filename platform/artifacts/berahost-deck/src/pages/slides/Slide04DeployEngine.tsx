export default function Slide04DeployEngine() {
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
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Deployment Engine
          </div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Session Persistence</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Live Console</div>
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
        <div style={{ fontSize: "1vw", color: "#9ECE6A", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "2vh" }}>
          Infrastructure
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
          Deployment Engine
        </h1>

        <p
          style={{
            fontSize: "1.4vw",
            color: "#9AA5CE",
            lineHeight: 1.6,
            maxWidth: "44vw",
            margin: "0 0 4vh 0",
          }}
        >
          Smart infrastructure under the hood.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vw", maxWidth: "54vw" }}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2.5vh 2vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "1.2vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "1vh" }}>Auto-dependency Detection</div>
            <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
              Reads the bot repo, installs required system packages and npm dependencies before first launch.
            </div>
            <div
              style={{
                marginTop: "1.5vh",
                backgroundColor: "#16161E",
                borderRadius: "0.4vw",
                padding: "1.2vh 1.2vw",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.85vw",
                color: "#9ECE6A",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              npm install --prefix /bot/dep_xyz
            </div>
          </div>

          <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2.5vh 2vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "1.2vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "1vh" }}>Deterministic Port Allocation</div>
            <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
              Each deployment gets a unique port, preventing conflicts across concurrent bots.
            </div>
            <div
              style={{
                marginTop: "1.5vh",
                backgroundColor: "#16161E",
                borderRadius: "0.4vw",
                padding: "1.2vh 1.2vw",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.85vw",
                color: "#7AA2F7",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              PORT=<span style={{ color: "#E0AF68" }}>42301</span> node bot.js
            </div>
          </div>

          <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2.5vh 2vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "1.2vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "1vh" }}>Crash Detection + Restart</div>
            <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
              Monitors exit codes, detects crashes, and restarts with exponential backoff automatically.
            </div>
          </div>

          <div style={{ backgroundColor: "rgba(255,255,255,0.02)", padding: "2.5vh 2vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "1.2vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "1vh" }}>Pairing Code Injection</div>
            <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
              Parses stdout for WhatsApp pairing codes and surfaces them directly in the dashboard UI.
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>04</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
