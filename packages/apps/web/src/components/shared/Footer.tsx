import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap foot-grid">
        <div style={{ maxWidth: "30ch" }}>
          <div
            className="brand"
            style={{ fontSize: 20, display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            <Image
              src="/tenorfi-logo.png"
              alt="TenorFi"
              width={500}
              height={500}
              className="brand-logo"
              style={{ height: 28, width: "auto", flex: "none" }}
            />
            <span style={{ lineHeight: 1 }}>TenorFi</span>
          </div>
          <p style={{ fontSize: "13.5px", color: "var(--fg-tertiary)", marginTop: 14 }}>
            Fixed funding-rate positions, rebuilt natively on Aqua — with collateral that
            never goes idle.
          </p>
        </div>
        <div className="foot-links">
          <div className="foot-col">
            <span className="h">Product</span>
            <Link href="/explorer">Create a position</Link>
            <Link href="/explorer">Explorer</Link>
            <a href="/#how">How it works</a>
          </div>
          <div className="foot-col">
            <span className="h">Build</span>
            <a href="/#arch">Architecture</a>
            <a href="https://github.com/yourusername/tenorfi" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a href="/docs/design-doc.md">Docs</a>
          </div>
          <div className="foot-col">
            <span className="h">Stack</span>
            <span>1inch Aqua</span>
            <span>Chainlink CRE</span>
            <span>LI.FI</span>
          </div>
        </div>
      </div>
      <div
        className="wrap"
        style={{
          marginTop: 40,
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          fontSize: "12.5px",
          color: "var(--fg-muted)",
        }}
      >
        <span>Built for ETHGlobal New York 2026 · Settlement in USDC on Base mainnet</span>
        <span>Non-custodial · You confirm every transaction</span>
      </div>

      <style>{`
        .foot-grid { display:flex; justify-content:space-between; gap:40px; flex-wrap:wrap; }
        .foot-links { display:flex; gap:40px; flex-wrap:wrap; }
        .foot-col { display:grid; gap:10px; }
        .foot-col a, .foot-col span:not(.h) { font-size:14px; color:var(--fg-tertiary); }
        .foot-col a:hover { color:var(--navy); }
        .foot-col .h { font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:var(--fg-muted); font-weight:600; margin-bottom:2px; }
        .footer .brand { display:flex; align-items:center; gap:11px; font-family:var(--f-display); font-weight:800; letter-spacing:-0.03em; color:var(--fg-primary); }
        .footer .brand-logo { height:30px; width:auto; }
      `}</style>
    </footer>
  );
}
