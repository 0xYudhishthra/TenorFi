"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OFFERS,
  fmtPct,
  fmtUSD,
  fmtUSDfull,
  estimatePositionFees,
  fmtUsdCents,
  type Offer,
} from "@/lib/tenorfi-data";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useChainId, useSwitchChain, useSendTransaction } from "wagmi";
import { truncateAddress, BASE_CHAIN_ID } from "@/lib/wallet";
import { quoteHedge, getFunding, type HedgeQuote } from "@/lib/api";

const CAP = 0.04; // per-period funding clamp → reserve coverage = cap × notional
const commas = (n: number) => n.toLocaleString("en-US");
const parseNum = (s: string) => parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0;

/**
 * The signable tx carried by each LI.FI leg. `quote.deposit` is a LI.FI classic
 * step (LiFiStep) and `quote.open` is a Composer ACTIVATE result; both expose a
 * `transactionRequest` with this shape. api.ts types them as `unknown`, so we
 * narrow locally and guard every field before sending.
 */
interface LegTxRequest {
  to?: string;
  data?: string;
  value?: string | number;
  gasLimit?: string | number;
  gas?: string | number;
}
function legTx(leg: unknown): LegTxRequest | null {
  if (!leg || typeof leg !== "object") return null;
  const req = (leg as { transactionRequest?: unknown }).transactionRequest;
  if (!req || typeof req !== "object") return null;
  const r = req as LegTxRequest;
  return typeof r.to === "string" && r.to.length > 0 ? r : null;
}
const BASESCAN_TX = (h: string) => `https://basescan.org/tx/${h}`;

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
  // Real hedge quote returned by keel-api on confirm (legs + notes), or an
  // error message if the API was unreachable. No fabricated tx hashes.
  const [quote, setQuote] = useState<HedgeQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // On-chain submit state. The deposit (LI.FI classic) and activate (Composer)
  // legs are sent from the connected Base wallet; hashes are the real on-chain
  // hashes returned by the wallet — never fabricated.
  const [submitting, setSubmitting] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | null>(null);
  const [openTxHash, setOpenTxHash] = useState<`0x${string}` | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { open } = useAppKit();
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const isOnBase = chainId === BASE_CHAIN_ID;
  const walletReady = isConnected && Boolean(address) && isOnBase;

  // Live funding for the "Floating now" ticker. Pull the current BTC funding
  // snapshot from keel-api once on mount and use its annualized rate (fraction
  // → %). Falls back to the animated mock below if the fetch fails.
  const [liveFloat, setLiveFloat] = useState<number | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getFunding("BTC", ctrl.signal)
      .then((snap) => setLiveFloat(snap.annualized * 100))
      .catch(() => setLiveFloat(null)); // keep the mock ticker
    return () => ctrl.abort();
  }, []);

  // floating ticker (mock fallback — only animates while live funding is absent)
  useEffect(() => {
    if (liveFloat !== null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let f = 41.7;
    const id = window.setInterval(() => {
      f += (Math.random() - 0.5) * 2.6;
      f = Math.max(28, Math.min(54, f));
      setFloat(f);
    }, 1500);
    return () => window.clearInterval(id);
  }, [liveFloat]);

  // What the ticket shows for "Floating now": live funding if available, mock otherwise.
  const floatPct = liveFloat ?? float;

  const offers = useMemo(() => offersForTenor(tenor), [tenor]);
  // drop selection if no longer present for the tenor
  useEffect(() => {
    if (offer && !offers.some((o) => o.id === offer.id)) setOffer(null);
  }, [offers, offer]);

  const prelock = Math.round(notional * CAP);
  // Estimated open/close fees (bps of notional + flat gas). See tenorfi-data.ts.
  const fees = estimatePositionFees(notional);

  const goStep = (n: number) => {
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Map a LI.FI leg's transactionRequest onto wagmi's sendTransactionAsync.
  // value/gas are optional; gasLimit (Composer) or gas — whichever is present —
  // becomes wagmi's `gas`. Returns the real on-chain tx hash from the wallet.
  const sendLeg = async (req: LegTxRequest): Promise<`0x${string}`> => {
    const rawValue = req.value;
    const rawGas = req.gasLimit ?? req.gas;
    return sendTransactionAsync({
      to: req.to as `0x${string}`,
      data: req.data as `0x${string}` | undefined,
      value: rawValue !== undefined ? BigInt(rawValue) : undefined,
      gas: rawGas !== undefined ? BigInt(rawGas) : undefined,
    });
  };

  const confirm = async () => {
    // Require a connected wallet on Base before subscribing. Wallet logic lives
    // in useWallet() and is untouched here — we only read the address.
    if (!walletReady || !address) return;
    setSigning(true);
    setQuote(null);
    setQuoteError(null);
    setSubmitError(null);
    setDepositTxHash(null);
    setOpenTxHash(null);

    // The subscriber posts ZERO collateral — they only approve Aqua to pull the
    // premium. `perpCollateralUsd` funds the Hyperliquid perp margin via LI.FI;
    // it is sized to the reserve coverage magnitude for the demo. Both are
    // decimal USDC strings (>0) as keel-api requires.
    const collateral = Math.max(1, prelock).toString();

    let result: HedgeQuote;
    try {
      // Real two-leg quote from keel-api. The API never signs; it returns
      // unsigned LI.FI legs: `deposit` (LI.FI classic, perp margin) and `open`
      // (Composer ACTIVATE, approves Aqua on Base — may be null).
      result = await quoteHedge({
        fromAddress: address as `0x${string}`,
        fromChain: BASE_CHAIN_ID,
        perpCollateralUsd: collateral,
        keelCollateralUsd: collateral,
      });
      setQuote(result);
    } catch (err) {
      setQuoteError(
        err instanceof Error ? err.message : "keel-api unreachable — quote unavailable",
      );
      setSigning(false);
      goStep(3);
      return;
    }

    // Quote built — now submit the legs from the connected Base wallet. Send the
    // deposit (perp margin, cross-chain) first, await its hash, THEN the activate
    // leg (approve Aqua on Base). Stop on any wallet rejection — never advance to
    // the next leg, never fabricate a hash.
    setSigning(false);
    goStep(3);
    setSubmitting(true);
    try {
      const depositReq = legTx(result.deposit);
      if (depositReq) {
        const hash = await sendLeg(depositReq);
        setDepositTxHash(hash);
      } else {
        setSubmitError("Deposit leg has no signable transaction.");
        setSubmitting(false);
        return;
      }

      // Activate (approve Aqua) leg — only if keel-api built it.
      const openReq = result.open ? legTx(result.open) : null;
      if (openReq) {
        const hash = await sendLeg(openReq);
        setOpenTxHash(hash);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Wallet rejected or the transaction failed.",
      );
    } finally {
      setSubmitting(false);
    }
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
              {/* The fixed-rate OFFERS are mock (no api endpoint). The selected
                  offer rate is DISPLAY-ONLY — the keel-api hedge quote uses its
                  own fixed rate server-side. Future work: pass offer.fixedRate
                  through to quoteHedge so the displayed rate drives the quote. */}
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
                Two transactions — LI.FI Composer deposits your USDC cross-chain into the
                perp, and activates the TenorFi subscription on Base.
              </p>
              <div className="rev">
                {[
                  ["Market", `BTC-PERP · ${dir === "long" ? "Long" : "Short"}`],
                  ["Notional", `$${commas(notional)}`],
                  ["Tenor", `${tenor} days`],
                  ["Fixed rate (locked)", `${fmtPct(offer.fixedRate)} APR`],
                  ["Max coverage", fmtUSDfull(offer.maxCoverage)],
                  ["Reserve coverage (pre-funded)", `${fmtUSDfull(prelock)} / period`],
                  ["Settlement", "USDC · hourly · Base mainnet"],
                  ["Subscriber", address ? truncateAddress(address) : "Not connected"],
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
                  <div className="d">LI.FI deposits the perp margin cross-chain; the perp order is placed by the TenorFi agent via the Hyperliquid API.</div>
                </div>
                <div className="leg">
                  <div className="t">② TenorFi subscription</div>
                  <div className="d">You approve Aqua to pull the fixed premium as it&apos;s due — you lock no collateral; the reserve pre-funds coverage.</div>
                </div>
              </div>
              <div className="rev" style={{ marginTop: 14 }}>
                <div className="r">
                  <span className="k">
                    Est. fee to open{" "}
                    <span className="badge badge-clay" style={{ fontSize: 10, marginLeft: 4 }}>
                      <span className="dot" /> estimated
                    </span>
                  </span>
                  <span className="v mono">~{fmtUsdCents(fees.openTotalUsd)}</span>
                </div>
                <div className="r">
                  <span className="k">Est. fee to close</span>
                  <span className="v mono">~{fmtUsdCents(fees.closeTotalUsd)}</span>
                </div>
              </div>
              <div className="flow-actions">
                <button className="btn btn-ghost btn-lg" onClick={() => goStep(1)}>
                  ← Back
                </button>
                {!isConnected || !address ? (
                  <button
                    className="btn btn-primary btn-lg"
                    disabled={isConnecting}
                    onClick={() => open()}
                  >
                    {isConnecting ? "Connecting…" : "Connect wallet to subscribe"}
                  </button>
                ) : !isOnBase ? (
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
                  >
                    Switch to Base to subscribe
                  </button>
                ) : (
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
                )}
              </div>
              <p style={{ fontSize: 12, color: "var(--fg-tertiary)", marginTop: 12, lineHeight: 1.5 }}>
                Onboarding is two transactions — LI.FI Composer deposits your USDC cross-chain
                into the perp, then activates the TenorFi subscription on Base. A connected wallet
                on Base is required first.
              </p>
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
                  {tenor} days. Net funding cost stays pinned — watch it settle hourly.
                </p>

                {/* Real hedge-quote result from keel-api (legs + notes). */}
                <div className="rev" style={{ maxWidth: 520, margin: "20px auto 0", textAlign: "left" }}>
                  <div className="r">
                    <span className="k">Hedge quote</span>
                    <span className="v">
                      <span className={`badge ${quote && !quoteError ? "badge-up" : "badge-clay"}`} style={{ fontSize: 10 }}>
                        <span className="dot" /> {quote && !quoteError ? "live · keel-api" : "demo · keel-api offline"}
                      </span>
                    </span>
                  </div>
                  {quote ? (
                    <>
                      <div className="r">
                        <span className="k">① Perp deposit leg (LI.FI)</span>
                        <span className="v" style={{ color: quote.deposit ? "var(--up)" : "var(--fg-tertiary)" }}>
                          {quote.deposit ? "Built ✓" : "—"}
                        </span>
                      </div>
                      <div className="r">
                        <span className="k">② KeelSwap open leg</span>
                        <span className="v" style={{ color: quote.open ? "var(--up)" : "var(--clay-600)" }}>
                          {quote.open ? "Built ✓" : "Skipped"}
                        </span>
                      </div>
                      {quote.notes.length > 0 && (
                        <div className="r" style={{ alignItems: "flex-start" }}>
                          <span className="k">Notes</span>
                          <span className="v" style={{ textAlign: "right", fontSize: 12.5, color: "var(--fg-tertiary)", lineHeight: 1.5 }}>
                            {quote.notes.map((n, i) => (
                              <div key={i}>{n}</div>
                            ))}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="r">
                      <span className="k">Status</span>
                      <span className="v" style={{ fontSize: 12.5, color: "var(--fg-tertiary)", textAlign: "right" }}>
                        {quoteError ?? "Quote unavailable"}
                      </span>
                    </div>
                  )}
                </div>

                {/* On-chain submit — the two legs are sent from the connected Base
                    wallet. We show the REAL tx hashes as they land (never fabricated)
                    and link each to BaseScan. Rendered only when a quote was built. */}
                {quote && (
                  <div className="rev" style={{ maxWidth: 520, margin: "14px auto 0", textAlign: "left" }}>
                    <div className="r">
                      <span className="k">On-chain submit</span>
                      <span className="v">
                        <span
                          className={`badge ${!submitting && (openTxHash || depositTxHash) && !submitError ? "badge-up" : "badge-clay"}`}
                          style={{ fontSize: 10 }}
                        >
                          <span className="dot" />{" "}
                          {submitting
                            ? "signing in wallet…"
                            : submitError
                              ? "stopped"
                              : openTxHash || depositTxHash
                                ? "sent"
                                : "awaiting wallet"}
                        </span>
                      </span>
                    </div>
                    <div className="r">
                      <span className="k">① Perp deposit tx</span>
                      <span className="v" style={{ textAlign: "right" }}>
                        {depositTxHash ? (
                          <a
                            href={BASESCAN_TX(depositTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="mono"
                            style={{ fontSize: 12.5, color: "var(--up)" }}
                          >
                            {truncateAddress(depositTxHash)} ↗
                          </a>
                        ) : (
                          <span style={{ fontSize: 12.5, color: "var(--fg-tertiary)" }}>—</span>
                        )}
                      </span>
                    </div>
                    <div className="r">
                      <span className="k">② Activate Aqua tx</span>
                      <span className="v" style={{ textAlign: "right" }}>
                        {openTxHash ? (
                          <a
                            href={BASESCAN_TX(openTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="mono"
                            style={{ fontSize: 12.5, color: "var(--up)" }}
                          >
                            {truncateAddress(openTxHash)} ↗
                          </a>
                        ) : (
                          <span style={{ fontSize: 12.5, color: "var(--fg-tertiary)" }}>
                            {quote.open ? "—" : "Skipped"}
                          </span>
                        )}
                      </span>
                    </div>
                    {submitError && (
                      <div className="r" style={{ alignItems: "flex-start" }}>
                        <span className="k">Error</span>
                        <span className="v" style={{ textAlign: "right", fontSize: 12.5, color: "var(--clay-600)", lineHeight: 1.5 }}>
                          {submitError}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flow-actions" style={{ justifyContent: "center" }}>
                  <Link href="/explorer" className="btn btn-primary btn-lg">
                    Go to explorer →
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
              <span className="k">Reserve coverage (pre-funded)</span>
              <span className="v">{fmtUSDfull(prelock)} / period</span>
            </div>
            <div className="row">
              <span className="k">Floating now</span>
              <span className="v flt">+{floatPct.toFixed(1)}%</span>
            </div>
            <div className="row">
              <span className="k">Your net funding</span>
              <span className="v">{offer ? `${fmtPct(offer.fixedRate)} fixed` : "—"}</span>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--fg-tertiary)", marginTop: 14, padding: "0 6px", lineHeight: 1.5 }}>
            Non-custodial — you lock no collateral. You only approve Aqua to pull the fixed
            premium as it&apos;s due; the reserve pre-funds the coverage.
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
