import Link from "next/link";
import HeroA from "@/components/landing/HeroA";
import Problem from "@/components/landing/Problem";
import Reveal from "@/components/landing/Reveal";
import Team from "@/components/landing/Team";

export default function Home() {
  return (
    <>
      <HeroA />

      {/* ---- Built on ---- */}
      <div className="builton wrap">
        <Reveal>
          <div className="eyebrow" style={{ textAlign: "center", marginBottom: 22 }}>
            Load-bearing — pull any one and the product breaks
          </div>
          <div className="row">
            <span className="lw">1inch&nbsp;Aqua</span>
            <span className="lw">Chainlink&nbsp;CRE</span>
            <span className="lw">LI.FI&nbsp;Composer</span>
            <span className="lw">Hyperliquid</span>
            <span className="lw">Base</span>
          </div>
        </Reveal>
      </div>

      {/* ---- Problem ---- */}
      <Problem />

      {/* ---- Create a position ---- */}
      <section className="section" id="create" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <div className="create">
              <div className="create-left">
                <span className="eyebrow">In a few clicks</span>
                <h2 className="display">Create a position.</h2>
                <p className="lead" style={{ marginTop: 14, maxWidth: "40ch" }}>
                  Pick the market you&rsquo;re hedging and a standing fixed-rate offer.
                  TenorFi assembles both legs of the hedge — you confirm with a single
                  signature.
                </p>
                <div className="create-steps">
                  <div className="cstep">
                    <span className="n">1</span>
                    <p>
                      <b>Pick your market.</b> Choose what you&rsquo;re hedging and your
                      notional.
                    </p>
                  </div>
                  <div className="cstep">
                    <span className="n">2</span>
                    <p>
                      <b>Pick an offer.</b> Choose a standing fixed-rate quote and its max
                      coverage.
                    </p>
                  </div>
                  <div className="cstep">
                    <span className="n">3</span>
                    <p>
                      <b>Confirm once.</b> LI.FI bundles cross-chain USDC into both legs;
                      your rate is locked.
                    </p>
                  </div>
                </div>
                <Link href="/create-position" className="btn btn-primary btn-lg" style={{ marginTop: 30 }}>
                  Open the flow →
                </Link>
              </div>
              <div className="create-right">
                <div
                  className="glow"
                  style={{
                    position: "absolute",
                    inset: "-30% -20% auto",
                    height: "90%",
                    background:
                      "radial-gradient(ellipse at 70% 0%, rgba(94,123,166,0.3), transparent 60%)",
                  }}
                />
                <div className="mini-quote">
                  <div className="q">
                    <b>3 standing offers</b> — pick one to lock your rate.
                  </div>
                  <div className="q" style={{ marginTop: 6 }}>
                    Each is a fixed rate plus its max coverage.
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="offer sel">
                    <div>
                      <div className="r">10.0%</div>
                      <div className="c">$20k max coverage</div>
                    </div>
                    <span className="badge badge-navy" style={{ height: 24 }}>
                      <span className="dot" />
                      Picked
                    </span>
                  </div>
                  <div className="offer">
                    <div>
                      <div className="r">8.5%</div>
                      <div className="c">$10k max coverage</div>
                    </div>
                    <span className="c">Conservative</span>
                  </div>
                  <div className="offer">
                    <div>
                      <div className="r">12.0%</div>
                      <div className="c">$40k max coverage</div>
                    </div>
                    <span className="c">Wide cap</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section
        className="section"
        id="how"
        style={{
          background: "var(--bg-sunk)",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="wrap">
          <Reveal>
            <div className="shead">
              <span className="eyebrow">How it works</span>
              <h2 className="display">
                Three beats. <em className="flat">No terminal.</em>
              </h2>
            </div>
          </Reveal>
          <div className="steps">
            <Reveal className="step card">
              <div className="num">01</div>
              <h3>Pick your market</h3>
              <p>
                Choose the perp you&rsquo;re hedging and your notional. No dashboards to
                learn.
              </p>
            </Reveal>
            <Reveal className="step card" delay={0.08}>
              <div className="num">02</div>
              <h3>Lock in one click</h3>
              <p>
                Take a standing fixed-rate offer. LI.FI bundles your USDC into both legs and
                your rate is set.
              </p>
            </Reveal>
            <Reveal className="step card" delay={0.16}>
              <div className="num">03</div>
              <h3>Auto-settlement</h3>
              <p>
                Each hour the position settles in USDC against a Chainlink funding feed.
                Funding is capped; collateral is pre-locked to cover it.
              </p>
            </Reveal>
          </div>
          <Reveal className="brink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flex: "none", color: "var(--clay-600)", marginTop: 1 }}>
              <path
                d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div style={{ fontSize: "14.5px", color: "var(--fg-secondary)" }}>
              <b style={{ color: "var(--fg-primary)" }}>At the brink:</b> if collateral runs
              low, TenorFi doesn&rsquo;t close blindly. It surfaces the call —{" "}
              <b style={{ color: "var(--fg-primary)" }}>you</b> confirm close, re-match, or
              add collateral. You decide what moves money.
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Architecture ---- */}
      <section className="section" id="arch">
        <div className="wrap">
          <Reveal>
            <div className="shead">
              <span className="eyebrow">Architecture</span>
              <h2 className="display">
                A measured number,
                <br />
                settled natively.
              </h2>
            </div>
          </Reveal>
          <Reveal className="arch">
            <div className="arch-flow">
              <div className="node-stack">
                <div className="node">
                  <div className="k">Oracle</div>
                  <div className="t">Chainlink CRE</div>
                  <div className="d">
                    Reads Hyperliquid funding, reaches DON consensus, writes the index
                    on-chain.
                  </div>
                </div>
                <div className="node">
                  <div className="k">On-ramp</div>
                  <div className="t">LI.FI Composer</div>
                  <div className="d">
                    One signature brings cross-chain USDC into both legs of the hedge.
                  </div>
                </div>
              </div>
              <div className="node node-core">
                <div className="k">The engine</div>
                <div className="t" style={{ fontSize: 22, color: "#fff" }}>
                  TenorFi on 1inch Aqua
                </div>
                <div className="d">
                  A custom{" "}
                  <span className="mono" style={{ color: "var(--navy-400)" }}>
                    _fundingSettle
                  </span>{" "}
                  opcode nets fixed-vs-floating each period. Collateral stays live as an
                  Aqua virtual balance — never custodied, never idle.
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="badge" style={{ background: "rgba(255,255,255,0.06)", borderColor: "var(--line-ink)", color: "rgba(238,242,248,0.8)" }}>
                    Base mainnet
                  </span>
                  <span className="badge" style={{ background: "rgba(255,255,255,0.06)", borderColor: "var(--line-ink)", color: "rgba(238,242,248,0.8)" }}>
                    USDC settlement
                  </span>
                </div>
              </div>
              <div className="node-stack">
                <div className="node">
                  <div className="k">Customer</div>
                  <div className="t">Hedger</div>
                  <div className="d">
                    Pays fixed, receives floating — their variable funding is cancelled.
                  </div>
                </div>
                <div className="node">
                  <div className="k">Counterparty</div>
                  <div className="t">TenorFi LP</div>
                  <div className="d">
                    Stands as the always-on rate-offerer so you lock instantly.
                  </div>
                </div>
              </div>
            </div>
            <div className="arch-foot">
              <span>
                Settlement: <b>USDC on Base mainnet</b>
              </span>
              <span>
                Funding source: <b>Hyperliquid BTC-PERP</b>
              </span>
              <span>
                Custody: <b>non-custodial (Aqua virtual balances)</b>
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="section" id="features" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <div className="shead">
              <span className="eyebrow">What&rsquo;s covered</span>
              <h2 className="display">Everything the desk needs.</h2>
            </div>
          </Reveal>
          <Reveal className="feat">
            <Feature
              title="Read live funding"
              body="The actual funding rate, straight from Hyperliquid via Chainlink CRE."
              icon={<path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            />
            <Feature
              title="List LP offers"
              body="Standing fixed-rate quotes with their max coverage, ready to lock."
              icon={<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            />
            <Feature
              title="Open positions"
              body="One signature opens both legs of the hedge through LI.FI Composer."
              icon={<path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            />
            <Feature
              title="Monitor settlements"
              body="An hourly USDC ledger — every period netted AFR vs FFR, on-chain."
              icon={<><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 9h18M8 14h8" stroke="currentColor" strokeWidth="1.8" /></>}
            />
            <Feature
              title="Manage collateral"
              body="Health bars per side. No default possible — the worst case is pre-funded."
              icon={<path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />}
            />
            <Feature
              title="Close or continue"
              body="At the brink, TenorFi surfaces three paths. You confirm the one that moves money."
              icon={<path d="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            />
          </Reveal>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section
        className="section"
        id="faq"
        style={{ background: "var(--bg-sunk)", borderTop: "1px solid var(--line)" }}
      >
        <div className="wrap">
          <Reveal>
            <div className="shead">
              <span className="eyebrow">Questions</span>
              <h2 className="display">Answered.</h2>
            </div>
          </Reveal>
          <Reveal className="faq">
            <Faq
              q="Is my collateral locked away?"
              a="No. TenorFi is non-custodial. Your collateral stays live in your wallet as an Aqua virtual balance while it backs the position. Strips and IPOR lock collateral dead for weeks — TenorFi keeps it working."
              open
            />
            <Faq
              q="What happens if funding spikes?"
              a="Your rate doesn't move. Funding is capped per hour, collateral is pre-locked to cover that maximum, and the position settles hourly — so the most anyone can owe in a period is already paid up front. No default is possible."
            />
            <Faq
              q="Hedger or LP — which am I?"
              a="If you hold a perp and want certainty, you're the hedger — you pay fixed and receive floating, cancelling your variable funding. The TenorFi LP is the standing counterparty so you can lock instantly without waiting for a match."
            />
            <Faq
              q="Which chains and assets?"
              a="Settlement is in USDC on Base mainnet. Funding data is read from Hyperliquid's BTC-PERP. LI.FI brings your USDC from any chain in a single flow."
            />
            <Faq
              q="Who controls my funds?"
              a="You do. TenorFi is non-custodial and you sign every transaction that moves money. Settlement runs on a deterministic on-chain opcode against a Chainlink funding feed — no discretionary party can touch your collateral."
            />
          </Reveal>
        </div>
      </section>

      {/* ---- Team ---- */}
      <Team />
    </>
  );
}

function Feature({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="fcard">
      <svg className="ficon" viewBox="0 0 24 24" fill="none">
        {icon}
      </svg>
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
}

function Faq({ q, a, open }: { q: string; a: string; open?: boolean }) {
  return (
    <details className="qa" open={open}>
      <summary>
        {q}
        <svg className="chev" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="ans">{a}</div>
    </details>
  );
}
