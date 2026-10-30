export default function Slide07Plans() {
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
          <div style={{ fontSize: "1vw", color: "#7AA2F7", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.8vw" }}>
            <span style={{ width: "3px", height: "1.4vw", backgroundColor: "#7AA2F7", borderRadius: "2px", marginLeft: "-3vw" }} />
            Plans & Economy
          </div>
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
          Monetization
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
          Plans & Economy
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
          Flexible tiers for every use case.
        </p>

        <div style={{ display: "flex", gap: "1.5vw", maxWidth: "54vw", marginBottom: "3vh" }}>
          <div style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.02)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
            <div style={{ fontSize: "1vw", color: "#565F89", marginBottom: "0.8vh", fontWeight: 500 }}>Free</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#C0CAF5", fontFamily: "'DM Mono', monospace" }}>1</div>
            <div style={{ fontSize: "0.85vw", color: "#565F89", marginTop: "0.5vh" }}>bot</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(122, 162, 247, 0.06)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(122, 162, 247, 0.2)", textAlign: "center" }}>
            <div style={{ fontSize: "1vw", color: "#7AA2F7", marginBottom: "0.8vh", fontWeight: 500 }}>Starter</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#7AA2F7", fontFamily: "'DM Mono', monospace" }}>3</div>
            <div style={{ fontSize: "0.85vw", color: "#565F89", marginTop: "0.5vh" }}>bots</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(158, 206, 106, 0.06)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(158, 206, 106, 0.2)", textAlign: "center" }}>
            <div style={{ fontSize: "1vw", color: "#9ECE6A", marginBottom: "0.8vh", fontWeight: 500 }}>Pro</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#9ECE6A", fontFamily: "'DM Mono', monospace" }}>10</div>
            <div style={{ fontSize: "0.85vw", color: "#565F89", marginTop: "0.5vh" }}>bots</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(224, 175, 104, 0.06)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(224, 175, 104, 0.2)", textAlign: "center" }}>
            <div style={{ fontSize: "1vw", color: "#E0AF68", marginBottom: "0.8vh", fontWeight: 500 }}>Business</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#E0AF68", fontFamily: "'DM Mono', monospace" }}>25</div>
            <div style={{ fontSize: "0.85vw", color: "#565F89", marginTop: "0.5vh" }}>bots</div>
          </div>
          <div style={{ flex: 1, backgroundColor: "rgba(247, 118, 142, 0.06)", padding: "2vh 1.5vw", borderRadius: "0.5vw", border: "1px solid rgba(247, 118, 142, 0.2)", textAlign: "center" }}>
            <div style={{ fontSize: "1vw", color: "#F7768E", marginBottom: "0.8vh", fontWeight: 500 }}>Enterprise</div>
            <div style={{ fontSize: "1.8vw", fontWeight: 700, color: "#F7768E", fontFamily: "'DM Mono', monospace" }}>&infin;</div>
            <div style={{ fontSize: "0.85vw", color: "#565F89", marginTop: "0.5vh" }}>bots</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "3vw", maxWidth: "54vw" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "1.1vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "1.5vh" }}>Coin System</div>
            <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.6 }}>
              Users spend coins to deploy bots. Coins can be purchased or topped up with admin-generated voucher codes.
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "1.1vw", color: "#FFFFFF", fontWeight: 600, marginBottom: "1.5vh" }}>Voucher Codes</div>
            <div style={{ fontSize: "1vw", color: "#9AA5CE", lineHeight: 1.6 }}>
              Admins generate redeemable codes for credit top-ups — useful for promotions, support credits, and onboarding.
            </div>
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1vw", color: "#565F89", fontWeight: 500 }}>07</div>
          <div style={{ fontSize: "0.9vw", color: "#565F89" }}>BERAHOST, Inc.</div>
        </div>
      </div>
    </div>
  );
}
