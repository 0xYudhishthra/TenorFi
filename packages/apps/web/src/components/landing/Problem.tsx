"use client";

import { useEffect, useRef, useState } from "react";

const LOCKED_BARS = [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
const UNLOCKED_BARS = [78, 64, 90, 52, 84, 70, 96, 40, 30, 18, 22, 14];

export default function Problem() {
  const [shown, setShown] = useState(false);
  const [num, setNum] = useState(41.7);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let cur = 41.7;
    const id = window.setInterval(() => {
      cur += (Math.random() - 0.5) * 2.6;
      cur = Math.max(28, Math.min(54, cur));
      setNum(cur);
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="section" id="problem">
      <div className="wrap">
        <div className="shead">
          <span className="eyebrow">The invisible cost</span>
          <h2 className="display">
            Billions rode on a rate
            <br />
            that <em className="flat">nobody could lock.</em>
          </h2>
          <p className="lead">
            Ethena lived off the funding rate. At its peak it held <b>~$16.6B</b>. When
            funding cooled, its yield compressed below borrow costs and capital fled — down
            to <b>~$5.6B</b>. No hack. Just a variable rate nobody could lock.
          </p>
        </div>
        <div className="vs" ref={ref}>
          <div className="vs-card vs-locked">
            <h3>Locked · fixed</h3>
            <div className="big">10.0%</div>
            <div style={{ color: "rgba(238,242,248,0.6)", fontSize: 14 }}>
              Your rate doesn&rsquo;t move. Income is a single flat number you can plan
              around.
            </div>
            <div className="bars">
              {LOCKED_BARS.map((h, i) => (
                <span
                  key={i}
                  style={{
                    height: shown ? `${h}%` : "0%",
                    background: "rgba(238,242,248,0.55)",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="vs-card vs-unlocked">
            <h3>Unlocked · variable</h3>
            <div className="big clay">{`+${num.toFixed(1)}%`}</div>
            <div style={{ color: "var(--fg-tertiary)", fontSize: 14 }}>
              Swings ~40% in a normal month. In a crash it craters — and at leverage,
              that&rsquo;s a liquidation.
            </div>
            <div className="bars">
              {UNLOCKED_BARS.map((h, i) => (
                <span
                  key={i}
                  style={{ height: shown ? `${h}%` : "0%", background: "var(--clay)" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
