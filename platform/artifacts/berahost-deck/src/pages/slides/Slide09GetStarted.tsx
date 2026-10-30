export default function Slide09GetStarted() {
  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{
        backgroundColor: "#1A1B26",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        color: "#C0CAF5",
        position: "relative",
      }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 60% 50%, rgba(122, 162, 247, 0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {/* Main Content — full width closing slide */}
      <div
        style={{
          flex: 1,
          padding: "10vh 10vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.2vw", marginBottom: "4vh" }}>
          <div style={{ width: "3.5vw", height: "3.5vw", backgroundColor: "#7AA2F7", borderRadius: "0.8vw", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "1.8vw", height: "1.8vw", backgroundColor: "#1A1B26", borderRadius: "0.4vw" }} />
          </div>
          <div style={{ fontSize: "2vw", fontWeight: 700, color: "#FFFFFF" }}>BERAHOST</div>
        </div>

        <h1
          style={{
            fontSize: "5.5vw",
            fontWeight: 800,
            color: "#FFFFFF",
            margin: "0 0 2.5vh 0",
            letterSpacing: "-0.03em",
            textAlign: "center",
          }}
        >
          Your bots. Always online.
        </h1>

        <p
          style={{
            fontSize: "1.6vw",
            color: "#9AA5CE",
            lineHeight: 1.6,
            maxWidth: "36vw",
            margin: "0 0 5vh 0",
            textAlign: "center",
          }}
        >
          Deploy, monitor, and scale WhatsApp bots with zero infrastructure overhead.
        </p>

        <div
          style={{
            padding: "2vh 3vw",
            backgroundColor: "rgba(158, 206, 106, 0.08)",
            border: "1px solid rgba(158, 206, 106, 0.25)",
            borderRadius: "0.5vw",
            fontFamily: "'DM Mono', monospace",
            fontSize: "1.3vw",
            color: "#9ECE6A",
            marginBottom: "6vh",
          }}
        >
          berahost.app
        </div>

        <div
          style={{
            display: "flex",
            gap: "4vw",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            paddingTop: "4vh",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <div style={{ width: "0.7vw", height: "0.7vw", backgroundColor: "#9ECE6A", borderRadius: "50%" }} />
            <div style={{ fontSize: "1.1vw", color: "#C0CAF5" }}>Session persistence</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <div style={{ width: "0.7vw", height: "0.7vw", backgroundColor: "#7AA2F7", borderRadius: "50%" }} />
            <div style={{ fontSize: "1.1vw", color: "#C0CAF5" }}>Live console & metrics</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <div style={{ width: "0.7vw", height: "0.7vw", backgroundColor: "#E0AF68", borderRadius: "50%" }} />
            <div style={{ fontSize: "1.1vw", color: "#C0CAF5" }}>Auto crash recovery</div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "5vh",
          left: "8vw",
          right: "8vw",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>09</div>
        <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
      </div>
    </div>
  );
}
