"use client";

import { useMemo, useRef } from "react";
import { FUNDING24H } from "@/lib/keel-data";

const W = 720;
const H = 240;
const PAD_T = 16;
const PAD_B = 18;

export default function FundingChart({
  onHover,
}: {
  onHover?: (value: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const crossRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  const { data, line, area, grid } = useMemo(() => {
    const data = FUNDING24H.map((d) => d.afr);
    const hi = Math.max(...data);
    const lo = Math.min(...data);
    const top = Math.ceil(hi / 10) * 10;
    const bot = Math.max(0, Math.floor(lo / 10) * 10 - 5);
    const X = (i: number) => (i / (data.length - 1)) * W;
    const Y = (v: number) => H - PAD_B - ((v - bot) / (top - bot)) * (H - PAD_T - PAD_B);

    let line = "";
    for (let i = 0; i < data.length; i++)
      line += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(data[i]).toFixed(1) + " ";
    const area = `${line}L${W} ${H - PAD_B} L0 ${H - PAD_B} Z`;

    const grid: { y: number; label: number }[] = [];
    for (let g = bot; g <= top; g += 10) grid.push({ y: Y(g), label: g });

    return { data, X, Y, line, area, grid, bot, top };
  }, []);

  const Xf = (i: number) => (i / (data.length - 1)) * W;
  const Yf = (v: number) => {
    const hi = Math.max(...data);
    const lo = Math.min(...data);
    const top = Math.ceil(hi / 10) * 10;
    const bot = Math.max(0, Math.floor(lo / 10) * 10 - 5);
    return H - PAD_B - ((v - bot) / (top - bot)) * (H - PAD_T - PAD_B);
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    let i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1));
    i = Math.max(0, Math.min(data.length - 1, i));
    const x = Xf(i);
    const y = Yf(data[i]);
    crossRef.current?.setAttribute("x1", String(x));
    crossRef.current?.setAttribute("x2", String(x));
    if (crossRef.current) crossRef.current.style.opacity = "1";
    dotRef.current?.setAttribute("cx", String(x));
    dotRef.current?.setAttribute("cy", String(y));
    if (dotRef.current) dotRef.current.style.opacity = "1";
    onHover?.(data[i]);
  };

  const handleLeave = () => {
    if (crossRef.current) crossRef.current.style.opacity = "0";
    if (dotRef.current) dotRef.current.style.opacity = "0";
    onHover?.(null);
  };

  return (
    <div className="fchart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 230 }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        <defs>
          <linearGradient id="fundingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--clay)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--clay)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1="0" y1={g.y.toFixed(1)} x2={W} y2={g.y.toFixed(1)} stroke="var(--line)" strokeWidth="1" />
            <text x="6" y={(g.y - 4).toFixed(1)} fill="var(--fg-muted)" fontFamily="ui-monospace,monospace" fontSize="10">
              {g.label}%
            </text>
          </g>
        ))}
        <path d={area} fill="url(#fundingFill)" />
        <path d={line} fill="none" stroke="var(--clay)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line ref={crossRef} x1="0" y1={PAD_T} x2="0" y2={H - PAD_B} stroke="var(--navy)" strokeWidth="1" strokeDasharray="3 3" style={{ opacity: 0 }} />
        <circle ref={dotRef} r="4.5" fill="var(--clay)" stroke="var(--bone)" strokeWidth="2.5" style={{ opacity: 0 }} />
      </svg>
    </div>
  );
}
