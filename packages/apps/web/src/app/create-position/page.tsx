"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OFFERS, fmtPct, fmtUSD, fmtUSDfull, type Offer } from "@/lib/tenorfi-data";

const CAP = 0.04; // per-period funding clamp → pre-locked collateral = cap × notional
const commas = (n: number) => n.toLocaleString("en-US");
const parseNum = (s: string) => parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0;

function offersForTenor(t: number): Offer[] {
  const match = OFFERS.filter((o) => o.tenor === t);
  const rest = OFFERS.filter((o) => o.tenor !== t);
  return match
    .concat(rest)
    .slice(0, 3)
    .map((o) => ({ ...o, tenor: t }));
}

export default function CreatePositionPage() {
  const [step, setStep] = useState(0); // 0..2, 3 = success
  const [dir, setDir] = useState<"long" | "short">("long");
  const [notional, setNotional] = useState(50000);
  const [notionalText, setNotionalText] = useState("50,000");
  const [tenor, setTenor] = useState(30);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [signing, setSigning] = useState(false);
  const [float, setFloat] = useState(41.7);

  // floating ticker
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let f = 41.7;
    const id = window.setInterval(() => {
      f += (Math.random() - 0.5) * 2.6;
      f = Math.max(28, Math.min(54, f));
      setFloat(f);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  const offers = useMemo(() => offersForTenor(tenor), [tenor]);
  // drop selection if no longer present for the tenor
  useEffect(() => {
    if (offer && !offers.some((o) => o.id === offer.id)) setOffer(null);
  }, [offers, offer]);

  const prelock = Math.round(notional * CAP);

  const goStep = (n: number) => {
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirm = () => {
    setSigning(true);
    window.setTimeout(() => {
      setSigning(false);
      goStep(3);
    }, 1100);
  };

  const stepState = (i: number) =>
    step === i ? "s on" : step > i ? "s done" : "s";

  return (
    <main className="wrap flow">
      <div className="flow-top">
        <div>
          <span className="eyebrow">New position</span>
          <h1 className="display" style={{ marginTop: 8 }}>
            Lock a fixed funding rate
          </h1>
        </div>
        <div className="stepper">
          <div className={stepState(0)}>
            <span className="num">1</span>
            <span className="lbl">Position</span>
          </div>
          <div className="bar" />
          <div className={stepState(1)}>
            <span className="num">2</span>
            <span className="lbl">Lock rate</span>
          </div>
          <div className="bar" />
          <div className={step >= 3 ? "s done" : stepState(2)}>
            <span className="num">3</span>
            <span className="lbl">Confirm</span>
          </div>
        </div>
      </div>

      <div className="flow-grid">
        {/* LEFT */}
        <div>
          {/* STEP 1 */}
          {step === 0 && (
            <section className="step-card card">
              <h2>Your perp position</h2>
              <p className="hint">
                The leg you want to protect from funding swings. TenorFi cancels its variable
                funding and pins it to a fixed rate.
              </p>

              <div className="fieldlbl">Market</div>
              <div className="market">
                <span className="ic">฿</span>
                <div>
                  <div style={{ fontWeight: 600 }}>BTC-PERP</div>
                  <div style={{ fontSize: 12, color: "var(--fg-tertiary)" }} className="mono">
                    Hyperliquid · funding hourly
                  </div>
                </div>
              </div>

              <div className="fieldlbl">Direction</div>
              <div className="seg">
                <button className={dir === "long" ? "on" : ""} onClick={() => setDir("long")}>
                  Long
                </button>
                <button className={dir === "short" ? "on" : ""} onClick={() => setDir("short")}>
                  Short
                </button>
              </div>

              <div className="fieldlbl">Notional</div>
              <div className="notional-in">
                <span className="cur">$</span>
                <input
                  inputMode="numeric"
                  value={notionalText}
                  onChange={(e) => {
                    const v = parseNum(e.target.value);
                    setNotional(v);
                    setNotionalText(v ? commas(v) : "");
                  }}
                  onBlur={() => {
                    if (!notional) {
                      setNotional(10000);
                      setNotionalText("10,000");
                    }
                  }}
                />
              </div>
              <div className="chips" style={{ marginTop: 12 }}>
                {[10000, 25000, 50000, 100000].map((n) => (
                  <button
                    key={n}
                    className={notional === n ? "on" : ""}
                    onClick={() => {
                      setNotional(n);
                      setNotionalText(commas(n));
                    }}
                  >
                    ${n / 1000}k
                  </button>
                ))}
              </div>

              <div className="fieldlbl">Tenor</div>
              <div className="chips">
                {[7, 30, 90].map((t) => (
                  <button key={t} className={tenor === t ? "on" : ""} onClick={() => setTenor(t)}>
                    {t} days
                  </button>
                ))}
              </div>

              <div className="flow-actions">
                <button className="btn btn-primary btn-lg" onClick={() => goStep(1)}>
                  Choose a rate →
                </button>
              </div>
            </section>
          )}

          {/* STEP 2 */}
          {step === 1 && (
            <section className="step-card card">
              <h2>Pick a fixed-rate offer</h2>
              <p className="hint">
                Standing quotes from TenorFi LPs. Each is a <b>fixed rate</b> plus a{" "}
                <b>max coverage</b> — the most the position pays out, pre-funded so no
                default is possible.
              </p>
              <div className="offers">
                {offers.map((o) => (
                  <div
                    key={o.id}
                    className={`offer-card ${offer?.id === o.id ? "on" : ""}`}
                    onClick={() => setOffer(o)}
                  >
                    <div>
                      <div className="rate">
                        {fmtPct(o.fixedRate)}{" "}
                        <span style={{ fontSize: 13, color: "var(--fg-tertiary)", fontWeight: 500, fontFamily: "var(--f-sans)" }}>
                          APR fixed
                        </span>
                      </div>
                      <div className="sub">
                        {o.note} · pre-locks <span className="mono">{fmtUSDfull(prelock)}</span> /
                        period
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                      <div className="right">
                        <div className="cov">{fmtUSD(o.maxCoverage)}</div>
                        <div className="sub">max coverage</div>
                      </div>
                      <span className="radio" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flow-actions">
                <button className="btn btn-ghost btn-lg" onClick={() => goStep(0)}>
                  ← Back
                </button>
                <button
                  className="btn btn-primary btn-lg"
                  disabled={!offer}
                  style={!offer ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  onClick={() => offer && goStep(2)}
                >
                  Review →
                </button>
              </div>
            </section>
          )}

          {/* STEP 3 */}
          {step === 2 && offer && (
            <section className="step-card card">
              <h2>Review &amp; confirm</h2>
              <p className="hint">
                One signature opens both legs. LI.FI Composer brings your USDC cross-chain
                and deposits into the Hyperliquid perp and the TenorFi position together.
              </p>
              <div className="rev">
                {[
                  ["Market", `BTC-PERP · ${dir === "long" ? "Long" : "Short"}`],
                  ["Notional", `$${commas(notional)}`],
                  ["Tenor", `${tenor} days`],
                  ["Fixed rate (locked)", `${fmtPct(offer.fixedRate)} APR`],
                  ["Max coverage", fmtUSDfull(offer.maxCoverage)],
                  ["Collateral pre-locked", `${fmtUSDfull(prelock)} / period`],
                  ["Settlement", "USDC · hourly · Base mainnet"],
                ].map(([k, v], i) => (
                  <div className="r" key={i}>
                    <span className="k">{k}</span>
                    <span className="v" style={i === 3 ? { color: "var(--navy)" } : undefined}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <div className="legrow">
                <div className="leg">
                  <div className="t">① Hyperliquid perp</div>
                  <div className="d">Collateral deposited via LI.FI; the agent places the order.</div>
                </div>
                <div className="leg">
                  <div className="t">② TenorFi position</div>
                  <div className="d">Your collateral ships into Aqua as a live virtual balance.</div>
                </div>
              </div>
              <div className="flow-actions">
                <button className="btn btn-ghost btn-lg" onClick={() => goStep(1)}>
                  ← Back
                </button>
                <button className="btn btn-primary btn-lg" disabled={signing} onClick={confirm}>
                  {signing ? (
                    <>
                      <span className="spin" />
                      Signing…
                    </>
                  ) : (
                    <>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      </svg>
                      Confirm &amp; sign
                    </>
                  )}
                </button>
              </div>
            </section>
          )}

          {/* SUCCESS */}
          {step === 3 && offer && (
            <section className="step-card card">
              <div className="done-card">
                <div className="done-ic">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                    <path d="m5 13 4 4 10-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h2>Rate locked.</h2>
                <p className="hint" style={{ maxWidth: "42ch", margin: "10px auto 0" }}>
                  Your funding rate is fixed at{" "}
                  <span className="confetti-rate">{fmtPct(offer.fixedRate)}</span> for{" "}
                  {tenor} days. Both legs are live. Net funding cost stays pinned — watch it
                  settle hourly.
                </p>
                <div className="flow-actions" style={{ justifyContent: "center" }}>
                  <Link href="/explorer/42" className="btn btn-primary btn-lg">
                    View position →
                  </Link>
                  <Link href="/explorer" className="btn btn-ghost btn-lg">
                    Go to explorer
                  </Link>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* RIGHT: live ticket */}
        <aside className="summary">
          <div className="ticket2">
            <div className="glow" />
            <div className="label">You lock — fixed rate</div>
            <div className="big">{offer ? fmtPct(offer.fixedRate) : "—"}</div>
            <div className="row">
              <span className="k">Market</span>
              <span className="v">BTC-PERP · {dir === "long" ? "Long" : "Short"}</span>
            </div>
            <div className="row">
              <span className="k">Notional</span>
              <span className="v">${commas(notional)}</span>
            </div>
            <div className="row">
              <span className="k">Tenor</span>
              <span className="v">{tenor} days</span>
            </div>
            <div className="row">
              <span className="k">Max coverage</span>
              <span className="v">{offer ? fmtUSDfull(offer.maxCoverage) : "—"}</span>
            </div>
            <div className="row">
              <span className="k">Collateral (pre-locked)</span>
              <span className="v">{fmtUSDfull(prelock)}</span>
            </div>
            <div className="row">
              <span className="k">Floating now</span>
              <span className="v flt">+{float.toFixed(1)}%</span>
            </div>
            <div className="row">
              <span className="k">Your net funding</span>
              <span className="v">{offer ? `${fmtPct(offer.fixedRate)} fixed` : "—"}</span>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--fg-tertiary)", marginTop: 14, padding: "0 6px", lineHeight: 1.5 }}>
            Non-custodial. Collateral stays in your wallet as an Aqua virtual balance. You
            approve every transaction.
          </p>
        </aside>
      </div>

      <style>{`
        .spin { width:17px; height:17px; border-radius:50%; border:2px solid currentColor; border-top-color:transparent; display:inline-block; animation:kspin .8s linear infinite; }
        @keyframes kspin { to { transform:rotate(360deg); } }
      `}</style>
    </main>
  );
}
