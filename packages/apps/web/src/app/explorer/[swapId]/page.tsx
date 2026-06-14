import Link from "next/link";
import {
  POSITIONS,
  getPosition,
  settlementsByPosition,
  shortAddr,
  fmtUSDfull,
  fmtPct,
  ago,
  fundingBreakdown,
  estimatePositionFees,
  fmtAprSigned,
  fmtUsdSigned,
  fmtUsdCents,
} from "@/lib/tenorfi-data";

export function generateStaticParams() {
  return POSITIONS.map((p) => ({ swapId: String(p.id) }));
}

const healthColor = (p: number) =>
  p > 0.5 ? "var(--up)" : p > 0.2 ? "var(--clay)" : "var(--down)";

export default function PositionDetailPage({
  params,
}: {
  params: { swapId: string };
}) {
  const position = getPosition(Number(params.swapId));

  if (!position) {
    return (
      <main className="wrap pd" style={{ textAlign: "center" }}>
        <h1 className="display" style={{ fontSize: 34, marginBottom: 12 }}>
          Position not found
        </h1>
        <p className="lead" style={{ marginBottom: 24 }}>
          No position matches #{params.swapId}.
        </p>
        <Link href="/explorer" className="btn btn-primary btn-lg">
          ← Back to explorer
        </Link>
      </main>
    );
  }

  const settlements = settlementsByPosition(position.id);
  const hp = position.status === "active" ? position.hedgerCollateral / position.maxCollateral : 0;
  const lpHp = position.status === "active" ? position.lpCollateral / position.maxCollateral : 0;
  const netPnl = settlements.reduce(
    (sum, s) => sum + (s.receiver === "Hedger" ? s.amount : -s.amount),
    0
  );

  // Per-period funding cost comparison + open/close fee estimate.
  // Derived in tenorfi-data.ts from the mock funding series; swap the
  // realized-rate source for the keel-api `/funding` endpoint to go live.
  const breakdown = fundingBreakdown(position, 6);
  const fees = estimatePositionFees(position.notional);

  return (
    <main className="wrap pd">
      <Link
        href="/explorer"
        className="alink"
        style={{ fontFamily: "var(--f-sans)", display: "inline-block", marginBottom: 18 }}
      >
        ← Back to explorer
      </Link>

      <div className="exp-head" style={{ marginBottom: 22 }}>
        <div>
          <span className="eyebrow">Fixed funding-rate position</span>
          <h1 className="display" style={{ marginTop: 8 }}>
            Position <span className="mono">#{position.id}</span>
          </h1>
        </div>
        <span className={`status status-${position.status}`} style={{ fontSize: 15 }}>
          <span className="dot" />
          {position.status === "active" ? "Active" : "Closed"}
        </span>
      </div>

      <div className="pd-grid">
        {/* left: terms + collateral + ledger */}
        <div style={{ display: "grid", gap: 20 }}>
          <div className="card pd-card">
            <h2 className="display" style={{ fontSize: 20, marginBottom: 8 }}>
              Terms
            </h2>
            <div className="kv">
              <span className="k">Market</span>
              <span className="v">BTC-PERP · Hyperliquid</span>
            </div>
            <div className="kv">
              <span className="k">Notional</span>
              <span className="v">{fmtUSDfull(position.notional)}</span>
            </div>
            <div className="kv">
              <span className="k">Fixed rate (locked)</span>
              <span className="v" style={{ color: "var(--navy)" }}>
                {fmtPct(position.fixedRate)} APR
              </span>
            </div>
            <div className="kv">
              <span className="k">Started</span>
              <span className="v">{position.startedAt}</span>
            </div>
            <div className="kv">
              <span className="k">Settlement</span>
              <span className="v">USDC · hourly · Base mainnet</span>
            </div>
          </div>

          {position.status === "active" && (
            <div className="card pd-card">
              <h2 className="display" style={{ fontSize: 20, marginBottom: 16 }}>
                Collateral health
              </h2>
              {[
                { label: "Hedger", val: position.hedgerCollateral, p: hp },
                { label: "LP", val: position.lpCollateral, p: lpHp },
              ].map((row) => (
                <div key={row.label} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13.5 }}>
                    <span style={{ color: "var(--fg-tertiary)" }}>{row.label}</span>
                    <span className="mono" style={{ color: healthColor(row.p), fontWeight: 600 }}>
                      {fmtUSDfull(row.val)} · {Math.round(row.p * 100)}%
                    </span>
                  </div>
                  <div className="healthbar" style={{ width: "100%", height: 8 }}>
                    <i style={{ width: `${Math.round(row.p * 100)}%`, background: healthColor(row.p) }} />
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 12.5, color: "var(--fg-tertiary)", marginTop: 12, lineHeight: 1.5 }}>
                Funding is capped per period and collateral is pre-locked to cover the
                maximum — no default is possible. You confirm what moves money.
              </p>
            </div>
          )}

          <div className="card tablecard">
            <div className="panel-head">
              <h3>Settlement ledger</h3>
              <span className="meta">{settlements.length} periods</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl" data-tabular="true">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>AFR</th>
                    <th>Flow</th>
                    <th>Amount</th>
                    <th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s, i) => {
                    const credit = s.receiver === "Hedger";
                    return (
                      <tr key={i}>
                        <td className="num" data-label="Period">
                          {s.period}
                        </td>
                        <td className="num" data-label="AFR" style={{ color: "var(--clay-600)" }}>
                          {fmtPct(s.afr)}
                        </td>
                        <td data-label="Flow" style={{ fontSize: 13 }}>
                          {s.payer} → {s.receiver}
                        </td>
                        <td className="num" data-label="Amount" style={{ color: credit ? "var(--up)" : "var(--clay-600)", fontWeight: 600 }}>
                          {credit ? "+" : "−"}
                          {fmtUSDfull(s.amount)}
                        </td>
                        <td className="num" data-label="Age" style={{ color: "var(--fg-tertiary)" }}>
                          {ago(s.ageSec)}
                        </td>
                      </tr>
                    );
                  })}
                  {settlements.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--fg-tertiary)", padding: 32 }}>
                        No settlements yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Funding cost breakdown — the value prop, per period */}
          <div className="card tablecard">
            <div className="panel-head">
              <h3>Funding cost breakdown</h3>
              <span className="meta">{breakdown.length} periods</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-tertiary)", lineHeight: 1.5, padding: "0 16px 4px" }}>
              Hyperliquid funding swings every hour. TenorFi&apos;s settlement absorbs the
              difference so <b style={{ color: "var(--navy)" }}>your real cost stays fixed at{" "}
              {fmtPct(position.fixedRate)} APR</b> — regardless of what Hyperliquid charges.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl" data-tabular="true">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>HL charged (variable)</th>
                    <th>TenorFi net</th>
                    <th>Your real cost</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((r) => (
                    <tr key={r.period}>
                      <td data-label="Period" style={{ fontSize: 13.5 }}>
                        Hour {r.period}
                      </td>
                      {/* HL charged — always a cost (variable), shown in clay */}
                      <td className="num" data-label="HL charged (variable)" style={{ color: "var(--clay-600)", fontWeight: 600 }}>
                        −{r.hlAprPct.toFixed(1)}% APR{" "}
                        <span style={{ color: "var(--fg-tertiary)", fontWeight: 500, fontSize: 12.5 }}>
                          (~{fmtUsdCents(r.hlUsd)})
                        </span>
                      </td>
                      {/* TenorFi net — signed: + credit (green), − premium (red) */}
                      <td className="num" data-label="TenorFi net" style={{ color: r.netUsd >= 0 ? "var(--up)" : "var(--down)", fontWeight: 600 }}>
                        {fmtAprSigned(r.netAprPct)} APR{" "}
                        <span style={{ color: "var(--fg-tertiary)", fontWeight: 500, fontSize: 12.5 }}>
                          ({fmtUsdSigned(r.netUsd)})
                        </span>
                      </td>
                      {/* Your real cost — the fixed rate, constant every row */}
                      <td className="num" data-label="Your real cost" style={{ color: "var(--navy)", fontWeight: 600 }}>
                        −{r.realAprPct.toFixed(1)}% APR{" "}
                        <span style={{ color: "var(--fg-tertiary)", fontWeight: 500, fontSize: 12.5 }}>
                          (~{fmtUsdCents(r.realUsd)})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--fg-tertiary)", marginTop: 4, padding: "12px 16px 4px", lineHeight: 1.5, borderTop: "1px solid var(--line)" }}>
              Your cost stays fixed regardless of what Hyperliquid charges. Per-hour USD figures
              scale with the {fmtUSDfull(position.notional)} notional; APR is the annualized rate.
            </p>
          </div>
        </div>

        {/* right: parties + net */}
        <aside style={{ display: "grid", gap: 20 }}>
          <div className="ticket2">
            <div className="glow" />
            <div className="label">Locked rate</div>
            <div className="big">{fmtPct(position.fixedRate)}</div>
            <div className="row">
              <span className="k">Notional</span>
              <span className="v">{fmtUSDfull(position.notional)}</span>
            </div>
            <div className="row">
              <span className="k">Net to hedger</span>
              <span className="v" style={{ color: netPnl >= 0 ? "#7ee0c8" : "var(--clay)" }}>
                {netPnl >= 0 ? "+" : "−"}
                {fmtUSDfull(Math.abs(netPnl))}
              </span>
            </div>
            <div className="row">
              <span className="k">Status</span>
              <span className="v">{position.status === "active" ? "Active" : "Closed"}</span>
            </div>
          </div>

          <div className="card pd-card">
            <h2 className="display" style={{ fontSize: 18, marginBottom: 8 }}>
              Parties
            </h2>
            <div className="kv">
              <span className="k">Hedger</span>
              <span className="v">{shortAddr(position.hedger)}</span>
            </div>
            <div className="kv">
              <span className="k">LP</span>
              <span className="v">{shortAddr(position.lp)}</span>
            </div>
          </div>

          <div className="card pd-card">
            <h2 className="display" style={{ fontSize: 18, marginBottom: 4 }}>
              Position fees
            </h2>
            <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginBottom: 12 }}>
              <span className="badge badge-clay" style={{ fontSize: 10.5 }}>
                <span className="dot" /> estimated
              </span>
            </p>
            <div className="kv">
              <span className="k">Open · bridge (LI.FI)</span>
              <span className="v mono">{fmtUsdCents(fees.openBridgeUsd)}</span>
            </div>
            <div className="kv">
              <span className="k">Open · Aqua ship</span>
              <span className="v mono">{fmtUsdCents(fees.openShipUsd)}</span>
            </div>
            <div className="kv">
              <span className="k">Open · gas</span>
              <span className="v mono">{fmtUsdCents(fees.openGasUsd)}</span>
            </div>
            <div className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
              <span className="k" style={{ fontWeight: 600 }}>To open</span>
              <span className="v mono" style={{ color: "var(--navy)", fontWeight: 600 }}>
                ~{fmtUsdCents(fees.openTotalUsd)}
              </span>
            </div>
            <div className="kv" style={{ marginTop: 8 }}>
              <span className="k">Close · unwind both legs</span>
              <span className="v mono">{fmtUsdCents(fees.closeUnwindUsd)}</span>
            </div>
            <div className="kv">
              <span className="k">Close · gas</span>
              <span className="v mono">{fmtUsdCents(fees.closeGasUsd)}</span>
            </div>
            <div className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
              <span className="k" style={{ fontWeight: 600 }}>To close</span>
              <span className="v mono" style={{ color: "var(--navy)", fontWeight: 600 }}>
                ~{fmtUsdCents(fees.closeTotalUsd)}
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--fg-tertiary)", marginTop: 12, lineHeight: 1.5 }}>
              Estimate only — bps of notional plus a flat gas figure. Live quotes resolve at
              signing time.
            </p>
          </div>

          <Link href="/create-position" className="btn btn-primary btn-lg">
            Create a position →
          </Link>
        </aside>
      </div>
    </main>
  );
}
