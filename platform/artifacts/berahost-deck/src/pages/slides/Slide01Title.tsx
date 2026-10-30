export default function Slide01Title() {
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
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Introduction
          </div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>The Problem</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Bot Marketplace</div>
        </div>

        <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#565F89", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2vh" }}>
          Features
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Deployment Engine</div>
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
        <div style={{ fontSize: "1vw", color: "#7AA2F7", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "2vh" }}>
          Platform Overview
        </div>

        <h1
          style={{
            fontSize: "5vw",
            fontWeight: 800,
            color: "#FFFFFF",
            margin: "0 0 2vh 0",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          BERAHOST
        </h1>

        <p
          style={{
            fontSize: "1.5vw",
            color: "#9AA5CE",
            lineHeight: 1.6,
            maxWidth: "40vw",
            margin: "0 0 5vh 0",
            fontWeight: 400,
          }}
        >
          Deploy and manage WhatsApp bots in minutes. Hosting infrastructure built for Node.js bot frameworks.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "1.8vh 2vw",
            backgroundColor: "rgba(158, 206, 106, 0.08)",
            border: "1px solid rgba(158, 206, 106, 0.2)",
            borderRadius: "0.5vw",
            marginBottom: "5vh",
            width: "fit-content",
          }}
        >
          <div style={{ fontSize: "1vw", fontWeight: 700, color: "#9ECE6A", marginRight: "1.5vw", fontFamily: "'DM Mono', monospace" }}>
            POST
          </div>
          <div style={{ fontSize: "1.1vw", color: "#FFFFFF", fontFamily: "'DM Mono', monospace" }}>
            /api/deployments/create
          </div>
        </div>

        <div style={{ display: "flex", gap: "3vw" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#FFFFFF", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1vh", marginBottom: "2vh" }}>
              Request
            </div>
            <div
              style={{
                backgroundColor: "#16161E",
                borderRadius: "0.5vw",
                padding: "2.5vh 2vw",
                border: "1px solid rgba(255,255,255,0.05)",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.95vw",
                lineHeight: 1.7,
              }}
            >
              <div style={{ color: "#C0CAF5" }}>{`{`}</div>
              <div style={{ paddingLeft: "2vw" }}>
                <span style={{ color: "#7AA2F7" }}>"botId"</span>
                <span style={{ color: "#C0CAF5" }}>: </span>
                <span style={{ color: "#E0AF68" }}>"whatsapp-md-v3"</span>
                <span style={{ color: "#C0CAF5" }}>,</span>
              </div>
              <div style={{ paddingLeft: "2vw" }}>
                <span style={{ color: "#7AA2F7" }}>"sessionId"</span>
                <span style={{ color: "#C0CAF5" }}>: </span>
                <span style={{ color: "#9ECE6A" }}>"sess_abc123"</span>
              </div>
              <div style={{ color: "#C0CAF5" }}>{`}`}</div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "1vh", marginBottom: "2vh" }}>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#FFFFFF" }}>Response</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5vw" }}>
                <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#9ECE6A", borderRadius: "50%" }} />
                <div style={{ fontSize: "0.9vw", fontFamily: "'DM Mono', monospace", color: "#9ECE6A" }}>201 Created</div>
              </div>
            </div>
            <div
              style={{
                backgroundColor: "#16161E",
                borderRadius: "0.5vw",
                padding: "2.5vh 2vw",
                border: "1px solid rgba(255,255,255,0.05)",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.95vw",
                lineHeight: 1.7,
              }}
            >
              <div style={{ color: "#C0CAF5" }}>{`{`}</div>
              <div style={{ paddingLeft: "2vw" }}>
                <span style={{ color: "#7AA2F7" }}>"deploymentId"</span>
                <span style={{ color: "#C0CAF5" }}>: </span>
                <span style={{ color: "#E0AF68" }}>"dep_xyz789"</span>
                <span style={{ color: "#C0CAF5" }}>,</span>
              </div>
              <div style={{ paddingLeft: "2vw" }}>
                <span style={{ color: "#7AA2F7" }}>"status"</span>
                <span style={{ color: "#C0CAF5" }}>: </span>
                <span style={{ color: "#9ECE6A" }}>"running"</span>
              </div>
              <div style={{ color: "#C0CAF5" }}>{`}`}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>01</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
