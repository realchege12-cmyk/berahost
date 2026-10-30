export default function Slide03Marketplace() {
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
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Bot Marketplace
          </div>
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
          Discovery
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
          Bot Marketplace
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
          Browse pre-vetted templates ready for instant deployment.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vw", maxWidth: "54vw" }}>
          <div
            style={{
              backgroundColor: "#16161E",
              borderRadius: "0.5vw",
              padding: "2.5vh 1.8vw",
              border: "1px solid rgba(122, 162, 247, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.8vw",
                fontFamily: "'DM Mono', monospace",
                color: "#7AA2F7",
                backgroundColor: "rgba(122, 162, 247, 0.08)",
                padding: "0.4vh 0.8vw",
                borderRadius: "0.3vw",
                display: "inline-block",
                marginBottom: "1.5vh",
              }}
            >
              whatsapp-md-v3
            </div>
            <div style={{ fontSize: "1.1vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.8vh" }}>Multi-Device Bot</div>
            <div style={{ fontSize: "0.95vw", color: "#9AA5CE", lineHeight: 1.5 }}>Baileys-based. Full MD support, group commands, media handling.</div>
          </div>

          <div
            style={{
              backgroundColor: "#16161E",
              borderRadius: "0.5vw",
              padding: "2.5vh 1.8vw",
              border: "1px solid rgba(158, 206, 106, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.8vw",
                fontFamily: "'DM Mono', monospace",
                color: "#9ECE6A",
                backgroundColor: "rgba(158, 206, 106, 0.08)",
                padding: "0.4vh 0.8vw",
                borderRadius: "0.3vw",
                display: "inline-block",
                marginBottom: "1.5vh",
              }}
            >
              sticker-bot
            </div>
            <div style={{ fontSize: "1.1vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.8vh" }}>Sticker Creator</div>
            <div style={{ fontSize: "0.95vw", color: "#9AA5CE", lineHeight: 1.5 }}>Convert images and video to WhatsApp stickers on demand.</div>
          </div>

          <div
            style={{
              backgroundColor: "#16161E",
              borderRadius: "0.5vw",
              padding: "2.5vh 1.8vw",
              border: "1px solid rgba(224, 175, 104, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.8vw",
                fontFamily: "'DM Mono', monospace",
                color: "#E0AF68",
                backgroundColor: "rgba(224, 175, 104, 0.08)",
                padding: "0.4vh 0.8vw",
                borderRadius: "0.3vw",
                display: "inline-block",
                marginBottom: "1.5vh",
              }}
            >
              gpt-assistant
            </div>
            <div style={{ fontSize: "1.1vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "0.8vh" }}>AI Assistant</div>
            <div style={{ fontSize: "0.95vw", color: "#9AA5CE", lineHeight: 1.5 }}>GPT-powered conversational bot with memory and persona config.</div>
          </div>
        </div>

        <div style={{ marginTop: "3vh", display: "flex", flexDirection: "column", gap: "1.5vh", maxWidth: "54vw" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", backgroundColor: "#7AA2F7", borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ fontSize: "1.1vw", color: "#C0CAF5" }}>Curated catalog of popular bot frameworks</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", backgroundColor: "#9ECE6A", borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ fontSize: "1.1vw", color: "#C0CAF5" }}>Deploy with one click — just supply your session config</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw" }}>
            <div style={{ width: "0.5vw", height: "0.5vw", backgroundColor: "#E0AF68", borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ fontSize: "1.1vw", color: "#C0CAF5" }}>Admin-managed marketplace with featured bots</div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>03</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
