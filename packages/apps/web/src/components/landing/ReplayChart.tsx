"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/* October 2025 funding replay — floating APR craters; locked stays flat at 10%. */
const LOCK = 10.0;
const N = 64;
const VMAX = 52;
const PAD_T = 18;
const PAD_B = 16;

function buildFloating(): number[] {
  const a: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let base: number;
    let crash: number;
    if (t < 0.62) {
      base = 42 - t * 10;
      crash = 0;
    } else {
      const k = (t - 0.62) / 0.38;
      base = 42 - 6;
      crash = 38 * Math.pow(k, 1.7);
    }
    const wob =
      Math.sin(i * 0.9) * 3.2 + Math.sin(i * 2.3) * 1.6 + (i % 5 === 0 ? 2 : 0);
    a.push(Math.max(2.5, base - crash + wob));
  }
  a[N - 1] = 4.1;
  return a;
}

function yFor(v: number, h: number) {
  return h - PAD_B - (v / VMAX) * (h - PAD_T - PAD_B);
}
function pathFor(series: number[], w: number, h: number) {
  let d = "";
  for (let i = 0; i < series.length; i++) {
    const x = (i / (series.length - 1)) * w;
    const y = yFor(series[i], h);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  }
  return d;
}

interface ReplayChartProps {
  width?: number;
  height?: number;
  /** Show a scrub slider (hero B style). */
  scrub?: boolean;
}

export default function ReplayChart({
  width = 560,
  height = 220,
  scrub = false,
}: ReplayChartProps) {
  const uid = useId().replace(/:/g, "");
  const clipRef = useRef<SVGRectElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [scrubVal, setScrubVal] = useState(100);

  const floating = useMemo(buildFloating, []);
  const lockY = yFor(LOCK, height);
  const floatPath = useMemo(() => pathFor(floating, width, height), [floating, width, height]);
  const areaPath = `${floatPath}L${width} ${lockY.toFixed(1)} L0 ${lockY.toFixed(1)} Z`;
  const grid = useMemo(
    () => [10, 25, 40].map((g) => yFor(g, height)),
    [height]
  );

  const setFrac = (f: number) => {
    f = Math.max(0, Math.min(1, f));
    clipRef.current?.setAttribute("width", (width * f).toFixed(1));
    const idx = Math.min(N - 1, Math.round(f * (N - 1)));
    const x = (idx / (N - 1)) * width;
    const y = yFor(floating[idx], height);
    if (dotRef.current) {
      dotRef.current.setAttribute("cx", x.toFixed(1));
      dotRef.current.setAttribute("cy", y.toFixed(1));
      dotRef.current.style.opacity = f > 0.01 ? "1" : "0";
    }
    if (labelRef.current) labelRef.current.style.opacity = f > 0.05 ? "1" : "0";
  };

  // Draw-on animation when the chart scrolls into view.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setFrac(1);
      return;
    }
    let done = false;
    const animate = () => {
      if (done) return;
      done = true;
      let start: number | null = null;
      const dur = 1500;
      const tick = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min(1, (ts - start) / dur);
        setFrac(1 - Math.pow(1 - p, 3));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          animate();
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    setFrac(scrub ? 1 : 0);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="replay-body">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: "100%", height: scrub ? 300 : 200 }}
          className="chart"
        >
          <defs>
            <clipPath id={`clip-${uid}`}>
              <rect ref={clipRef} x="0" y="0" width={width} height={height} />
            </clipPath>
            <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--clay)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--clay)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {grid.map((gy, i) => (
            <line
              key={i}
              x1="0"
              y1={gy.toFixed(1)}
              x2={width}
              y2={gy.toFixed(1)}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray="2 5"
            />
          ))}
          <g clipPath={`url(#clip-${uid})`}>
            <path d={areaPath} fill={`url(#grad-${uid})`} />
            <line
              x1="0"
              y1={lockY.toFixed(1)}
              x2={width}
              y2={lockY.toFixed(1)}
              stroke="var(--navy)"
              strokeWidth="2.5"
            />
            <path
              d={floatPath}
              fill="none"
              stroke="var(--clay)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
          <circle ref={dotRef} r="5" fill="var(--clay)" stroke="var(--bone)" strokeWidth="2.5" style={{ opacity: 0 }} />
          <g ref={labelRef} style={{ opacity: 0 }}>
            <rect x="6" y={(lockY - 22).toFixed(1)} width="78" height="18" rx="4" fill="var(--navy)" />
            <text
              x="12"
              y={(lockY - 9).toFixed(1)}
              fill="#fff"
              fontFamily="var(--f-mono)"
              fontSize="11"
              fontWeight="600"
            >
              LOCK 10.0%
            </text>
          </g>
        </svg>
      </div>
      {scrub && (
        <div className="replay-cap">
          <input
            className="scrub"
            type="range"
            min={0}
            max={100}
            value={scrubVal}
            aria-label="Scrub the replay"
            onChange={(e) => {
              const v = Number(e.target.value);
              setScrubVal(v);
              setFrac(v / 100);
            }}
          />
          <style>{`
            .scrub { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:4px; background: var(--paper-3); outline:none; }
            .scrub::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background: var(--navy); border:3px solid var(--bone); box-shadow: var(--sh-sm); cursor:pointer; }
            .scrub::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background: var(--navy); border:3px solid var(--bone); cursor:pointer; }
          `}</style>
        </div>
      )}
    </>
  );
}
