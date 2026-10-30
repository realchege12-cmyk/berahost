export default function Slide05Session() {
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
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Session Persistence
          </div>
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
        <div style={{ fontSize: "1vw", color: "#E0AF68", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "2vh" }}>
          Reliability
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
          Session Persistence
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
          The hardest WhatsApp problem, solved.
        </p>

        <div style={{ display: "flex", gap: "4vw", alignItems: "flex-start", maxWidth: "54vw" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2.5vh" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
                <div
                  style={{
                    width: "2.8vw",
                    height: "2.8vw",
                    borderRadius: "50%",
                    backgroundColor: "rgba(158, 206, 106, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9ECE6A",
                    fontSize: "1.1vw",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div>
                  <div style={{ fontSize: "1.3vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.5vh" }}>Full Baileys session backup</div>
                  <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
                    The entire <span style={{ fontFamily: "'DM Mono', monospace", color: "#7AA2F7" }}>auth_info_baileys/</span> directory is archived before shutdown and restored on restart.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
                <div
                  style={{
                    width: "2.8vw",
                    height: "2.8vw",
                    borderRadius: "50%",
                    backgroundColor: "rgba(224, 175, 104, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#E0AF68",
                    fontSize: "1.1vw",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div>
                  <div style={{ fontSize: "1.3vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.5vh" }}>Pre-keys and sender-keys preserved</div>
                  <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
                    Cryptographic keys survive restarts — no more decryption errors or forced re-link.
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
                <div
                  style={{
                    width: "2.8vw",
                    height: "2.8vw",
                    borderRadius: "50%",
                    backgroundColor: "rgba(122, 162, 247, 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#7AA2F7",
                    fontSize: "1.1vw",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div>
                  <div style={{ fontSize: "1.3vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.5vh" }}>SQLite config injection</div>
                  <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
                    For bots without env-var support, user config is written directly into the bot's internal SQLite database.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              width: "20vw",
              backgroundColor: "#16161E",
              borderRadius: "0.5vw",
              padding: "2.5vh 2vw",
              border: "1px solid rgba(255,255,255,0.05)",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.9vw",
              lineHeight: 1.7,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: "0.85vw", color: "#565F89", marginBottom: "1.5vh", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "1vh" }}>
              session.backup.ts
            </div>
            <div style={{ color: "#7AA2F7" }}>await <span style={{ color: "#9ECE6A" }}>backupSession</span><span style={{ color: "#C0CAF5" }}>(</span></div>
            <div style={{ paddingLeft: "1.5vw", color: "#C0CAF5" }}>
              deploymentId,
            </div>
            <div style={{ paddingLeft: "1.5vw" }}>
              <span style={{ color: "#E0AF68" }}>"auth_info_baileys/"</span>
            </div>
            <div style={{ color: "#C0CAF5" }}>);</div>
            <div style={{ marginTop: "1.5vh", display: "flex", alignItems: "center", gap: "0.5vw" }}>
              <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#9ECE6A", borderRadius: "50%" }} />
              <span style={{ color: "#9ECE6A", fontSize: "0.85vw" }}>200 OK — session saved</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>05</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
