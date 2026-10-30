export default function Slide02Problem() {
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
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            The Problem
          </div>
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
        <div style={{ fontSize: "1vw", color: "#F7768E", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: "2vh" }}>
          Context
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
          The Problem
        </h1>

        <p
          style={{
            fontSize: "1.4vw",
            color: "#9AA5CE",
            lineHeight: 1.6,
            maxWidth: "50vw",
            margin: "0 0 4vh 0",
          }}
        >
          Running a WhatsApp bot 24/7 is harder than it sounds.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "3vh", maxWidth: "52vw" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div
              style={{
                width: "3vw",
                height: "3vw",
                borderRadius: "50%",
                backgroundColor: "rgba(247, 118, 142, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F7768E",
                fontSize: "1.2vw",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              1
            </div>
            <div>
              <div style={{ fontSize: "1.4vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.8vh" }}>Session data lost on restart</div>
              <div style={{ fontSize: "1.1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
                Baileys pre-keys and sender-keys aren't persisted — every restart triggers decryption failures and reconnection loops.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div
              style={{
                width: "3vw",
                height: "3vw",
                borderRadius: "50%",
                backgroundColor: "rgba(224, 175, 104, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#E0AF68",
                fontSize: "1.2vw",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              2
            </div>
            <div>
              <div style={{ fontSize: "1.4vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.8vh" }}>No crash visibility or metrics</div>
              <div style={{ fontSize: "1.1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
                No way to monitor CPU, RAM, or log output. Silent crashes mean bots go offline unnoticed for hours.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw" }}>
            <div
              style={{
                width: "3vw",
                height: "3vw",
                borderRadius: "50%",
                backgroundColor: "rgba(122, 162, 247, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#7AA2F7",
                fontSize: "1.2vw",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              3
            </div>
            <div>
              <div style={{ fontSize: "1.4vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.8vh" }}>Developers do ops, not features</div>
              <div style={{ fontSize: "1.1vw", color: "#9AA5CE", lineHeight: 1.5 }}>
                Provisioning servers, installing dependencies, managing ports — hours lost to infrastructure instead of bot development.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>02</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
