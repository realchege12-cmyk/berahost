export default function Slide08Stack() {
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
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Live Console</div>
          <div style={{ fontSize: "1vw", color: "#C0CAF5", opacity: 0.6 }}>Plans & Economy</div>
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Stack
          </div>
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
          Technology
        </div>

        <h1
          style={{
            fontSize: "4.5vw",
            fontWeight: 800,
            color: "#FFFFFF",
            margin: "0 0 4vh 0",
            letterSpacing: "-0.03em",
          }}
        >
          Stack
        </h1>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vw", maxWidth: "54vw" }}>
          <div style={{ backgroundColor: "#16161E", borderRadius: "0.5vw", padding: "2.5vh 2vw", border: "1px solid rgba(122, 162, 247, 0.15)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#7AA2F7", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "1.5vh" }}>
              Frontend
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#9ECE6A" }}>React</span> · <span style={{ color: "#9ECE6A" }}>Vite</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#7AA2F7" }}>Tailwind CSS</span> · <span style={{ color: "#7AA2F7" }}>Shadcn/UI</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#E0AF68" }}>Framer Motion</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#C0CAF5" }}>Wouter</span> · <span style={{ color: "#C0CAF5" }}>TanStack Query</span>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: "#16161E", borderRadius: "0.5vw", padding: "2.5vh 2vw", border: "1px solid rgba(158, 206, 106, 0.15)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#9ECE6A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "1.5vh" }}>
              Backend
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1vh" }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#9ECE6A" }}>Node.js</span> · <span style={{ color: "#9ECE6A" }}>Express</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#7AA2F7" }}>Socket.io</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#E0AF68" }}>PostgreSQL</span> · <span style={{ color: "#E0AF68" }}>Drizzle ORM</span>
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
                <span style={{ color: "#F7768E" }}>child_process</span> lifecycle mgr
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "3vh", maxWidth: "54vw", backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "0.5vw", padding: "2vh 2vw", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: "0.85vw", color: "#565F89", marginBottom: "1vh", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>Auth & Validation</div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "1vw", color: "#C0CAF5" }}>
            <span style={{ color: "#7AA2F7" }}>express-session</span>
            <span style={{ color: "#565F89" }}> · </span>
            <span style={{ color: "#9ECE6A" }}>bcrypt</span>
            <span style={{ color: "#565F89" }}> · </span>
            <span style={{ color: "#E0AF68" }}>Drizzle-Zod</span>
            <span style={{ color: "#565F89" }}> · </span>
            <span style={{ color: "#C0CAF5" }}>Zod v4</span>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>08</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
