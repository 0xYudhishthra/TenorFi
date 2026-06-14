"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ReplayChart from "./ReplayChart";

export default function HeroA() {
  const [float, setFloat] = useState(41.7);

  // Live floating-rate ticker on the lock ticket.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let cur = 41.7;
    const id = window.setInterval(() => {
      cur += (Math.random() - 0.5) * 2.6;
      cur = Math.max(28, Math.min(54, cur));
      setFloat(cur);
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  const floatTxt = `${float >= 0 ? "+" : ""}${float.toFixed(1)}%`;

  return (
    <section className="hero show">
      <div className="wrap heroA-grid">
        <div>
          <span className="hero-eyebrow badge badge-navy">
            <span className="dot" /> Built natively on 1inch Aqua
          </span>
          <h1 className="display" style={{ marginTop: 22 }}>
            Lock your
            <br />
            funding rate.
          </h1>
          <p className="lead sub">
            Perp funding swings every hour. TenorFi turns your <em className="clay">variable</em>{" "}
            rate into a <em className="flat">fixed</em> one — in a few clicks. Your
            collateral never goes idle.
          </p>
          <div className="cta-row">
            <Link href="/create-position" className="btn btn-primary btn-lg">
              Create a position
            </Link>
            <Link href="/explorer" className="btn btn-ghost btn-lg">
              View explorer
            </Link>
          </div>
          <div className="trust">
            <div className="t">
              <div className="v navy">10.0%</div>
              <div className="k">Fixed rate, locked today</div>
            </div>
            <div className="t">
              <div className="v">$0</div>
              <div className="k">Variance once locked</div>
            </div>
            <div className="t">
              <div className="v">Hourly</div>
              <div className="k">USDC settlement</div>
            </div>
          </div>
        </div>

        <div className="heroA-aside">
          <div className="ticket">
            <div className="ticket-glow" />
            <div className="row">
              <div>
                <div className="label">Fixed rate — you lock</div>
                <div className="rate" style={{ fontSize: 64, marginTop: 8 }}>
                  10.0
                  <span style={{ fontSize: 26, color: "var(--clay)" }}>%</span>
                </div>
                <div className="perf">BTC-PERP · 30-day tenor · $50k notional</div>
              </div>
            </div>
            <hr style={{ border: 0, borderTop: "1px solid var(--line-ink)", margin: "20px 0" }} />
            <div className="row">
              <div>
                <div className="label">Floating now</div>
                <div
                  className="rate"
                  style={{ fontSize: 26, color: "var(--clay)", marginTop: 6 }}
                >
                  {floatTxt}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="label">Your net</div>
                <div className="rate" style={{ fontSize: 26, marginTop: 6 }}>
                  10.0%
                </div>
              </div>
            </div>
          </div>

          <div className="replay">
            <div className="replay-head">
              <div style={{ fontWeight: 600, fontSize: 14 }}>Relive October 2025</div>
              <div className="replay-legend">
                <span className="lg">
                  <span className="swatch" style={{ background: "var(--navy)" }} />
                  Locked
                </span>
                <span className="lg">
                  <span className="swatch" style={{ background: "var(--clay)" }} />
                  Floating
                </span>
              </div>
            </div>
            <ReplayChart width={560} height={220} />
            <div className="replay-cap">
              <div style={{ fontSize: 13, color: "var(--fg-tertiary)", maxWidth: "34ch" }}>
                Same crash. One fund bled{" "}
                <b style={{ color: "var(--fg-primary)" }}>$8B</b>. One didn&rsquo;t feel it.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
