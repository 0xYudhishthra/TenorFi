"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FundingChart from "./FundingChart";
import {
  POSITIONS,
  SETTLEMENTS,
  FUNDING24H,
  STATS,
  shortAddr,
  fmtUSD,
  fmtUSDfull,
  fmtPct,
  ago,
  fundingHistoryToAfr24h,
  snapshotToAfrPct,
  apiPositionsToMock,
  type Position,
} from "@/lib/tenorfi-data";
import {
  getFunding,
  getFundingHistory,
  listPositions,
  subscribePositionEvents,
} from "@/lib/api";

const MARKET = "BTC";

type SortKey = "id" | "notional" | "fixedRate" | "status" | "startedAt";
const KIND_LABEL: Record<string, string> = {
  position: "Position",
  address: "Address",
  tx: "Tx hash",
  invalid: "Unrecognized",
};

function detect(v: string): { kind: string | null; val?: string; demo?: boolean } {
  v = v.trim();
  if (!v) return { kind: null };
  if (/^#?\d+$/.test(v)) return { kind: "position", val: v.replace("#", "") };
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return { kind: "address", val: v };
  if (/^0x[0-9a-fA-F]{64}$/.test(v)) return { kind: "tx", val: v };
  if (v === "tx") return { kind: "tx", val: SETTLEMENTS[0].txHash, demo: true };
  return { kind: "invalid" };
}

const healthColor = (p: number) =>
  p > 0.5 ? "var(--up)" : p > 0.2 ? "var(--clay)" : "var(--down)";

export default function ExplorerClient() {
  const router = useRouter();
  const tableRef = useRef<HTMLDivElement>(null);

  // ---- live data source: keel-api, with graceful mock fallback ----
  // `live` flips true once any API read succeeds; drives the source badge.
  const [live, setLive] = useState(false);
  const [fundingSeries, setFundingSeries] =
    useState<{ hour: number; afr: number }[]>(FUNDING24H);
  const [livePositions, setLivePositions] = useState<Position[] | null>(null);
  // Raw keel-api position ids — used as the SSE subscription target.
  const [liveIds, setLiveIds] = useState<string[]>([]);

  // ---- live AFR ----
  const [afr, setAfr] = useState(STATS.currentAFR);
  const [hoverAfr, setHoverAfr] = useState<number | null>(null);

  // Fetch live funding (snapshot + 24h history) + positions on mount.
  // Each read falls back to the mock independently so a partial outage still
  // populates the UI.
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    (async () => {
      // Funding snapshot → current AFR.
      try {
        const snap = await getFunding(MARKET, ctrl.signal);
        if (!cancelled) {
          setAfr(snapshotToAfrPct(snap));
          setLive(true);
        }
      } catch {
        /* keep mock AFR; animated below if still demo */
      }
      // Funding history → chart series.
      try {
        const hist = await getFundingHistory(MARKET, undefined, undefined, ctrl.signal);
        const series = fundingHistoryToAfr24h(hist.history, 24);
        if (!cancelled && series.length > 1) {
          setFundingSeries(series);
          setLive(true);
        }
      } catch {
        /* keep FUNDING24H */
      }
      // Positions list → table + feed.
      try {
        const list = await listPositions(ctrl.signal);
        if (!cancelled && list.length > 0) {
          setLivePositions(apiPositionsToMock(list));
          setLiveIds(list.map((p) => p.id));
          setLive(true);
        }
      } catch {
        /* keep mock POSITIONS */
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  // Demo-only AFR drift animation — runs only while we have no live snapshot.
  useEffect(() => {
    if (live) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let cur = STATS.currentAFR;
    const id = window.setInterval(() => {
      cur += (Math.random() - 0.5) * 1.4;
      cur = Math.max(4, Math.min(48, cur));
      setAfr(cur);
    }, 1600);
    return () => window.clearInterval(id);
  }, [live]);

  // SSE: re-pull the positions list whenever any position emits an event, so
  // the explorer live-updates. Degrades silently if /events is unavailable.
  useEffect(() => {
    if (liveIds.length === 0) return;
    const ctrl = new AbortController();
    const refresh = async () => {
      try {
        const list = await listPositions(ctrl.signal);
        if (list.length > 0) {
          setLivePositions(apiPositionsToMock(list));
          setLiveIds((prev) => {
            const next = list.map((p) => p.id);
            return next.length === prev.length && next.every((v, i) => v === prev[i])
              ? prev
              : next;
          });
        }
      } catch {
        /* keep current snapshot */
      }
    };
    // Subscribe to the newest position's stream as the change signal; any
    // transition/note on it triggers a list refresh. Degrades silently.
    const unsub = subscribePositionEvents(liveIds[0], () => void refresh());
    return () => {
      ctrl.abort();
      unsub();
    };
  }, [liveIds]);

  const sourcePositions = livePositions ?? POSITIONS;

  const fundingStats = useMemo(() => {
    const data = fundingSeries.map((d) => d.afr);
    return {
      hi: Math.max(...data),
      lo: Math.min(...data),
      mean: data.reduce((a, b) => a + b, 0) / data.length,
    };
  }, [fundingSeries]);
  const shownCur = hoverAfr ?? afr;

  // Stats reflect the live list when present, else the mock STATS.
  const stats = useMemo(() => {
    if (!livePositions) return STATS;
    return {
      activePositions: livePositions.filter((p) => p.status === "active").length,
      totalNotional: livePositions.reduce((a, p) => a + p.notional, 0),
      settlements: STATS.settlements,
      currentAFR: STATS.currentAFR,
    };
  }, [livePositions]);

  // ---- search ----
  const [search, setSearch] = useState("");
  const searchKind = detect(search).kind;

  // ---- toast ----
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const toastTimer = useRef<number>();
  const showToast = (msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  // ---- table ----
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<-1 | 1>(-1);

  const rows = useMemo(() => {
    const statusRank = (s: string) => (s === "active" ? 1 : 0);
    const out = sourcePositions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (q) {
        const hay = `${s.id} ${s.hedger} ${s.lp}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      let x: number | string = a[sortKey];
      let y: number | string = b[sortKey];
      if (sortKey === "status") {
        x = statusRank(a.status);
        y = statusRank(b.status);
      }
      if (typeof x === "string") {
        x = x.toLowerCase();
        y = (y as string).toLowerCase();
      }
      return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
    });
    return out;
  }, [sourcePositions, filter, q, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d * -1) as -1 | 1);
    else {
      setSortKey(k);
      setSortDir(k === "id" || k === "notional" || k === "fixedRate" ? -1 : 1);
    }
  };

  const routeAddress = (addr: string) => {
    setQ(addr);
    setFilter("all");
    setSearch("");
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`Showing positions for ${shortAddr(addr)}`);
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = detect(search);
    if (d.kind === "position") {
      if (sourcePositions.some((s) => s.id === Number(d.val))) router.push(`/explorer/${d.val}`);
      else showToast(`Position #${d.val} not found`, true);
    } else if (d.kind === "address") {
      routeAddress(d.val!);
    } else if (d.kind === "tx") {
      const st =
        SETTLEMENTS.find((s) => s.txHash === d.val) || (d.demo ? SETTLEMENTS[0] : null);
      if (st) router.push(`/explorer/${st.positionId}`);
      else showToast("Transaction not found", true);
    } else {
      showToast("Enter a position #, a 40-hex address, or a 64-hex tx hash", true);
    }
  };

  const sortArrow = (k: SortKey) =>
    sortKey === k ? (sortDir > 0 ? "↑" : "↓") : "↕";

  return (
    <main className="wrap exp">
      <div className="exp-head">
        <div>
          <span className="eyebrow">On-chain · Base mainnet</span>
          <h1 className="display" style={{ marginTop: 10 }}>
            Explorer
          </h1>
        </div>
        <div className={`badge ${live ? "badge-up" : "badge-clay"}`} title={live ? "Reading from keel-api" : "keel-api unreachable — showing demo data"}>
          <span className="ping" style={{ width: 7, height: 7 }} />{" "}
          {live ? "Live · funding from Hyperliquid" : "Demo data · keel-api offline"}
        </div>
      </div>

      {/* stats */}
      <div className="statbar">
        <div className="stat card">
          <div className="k">Active positions</div>
          <div className="v" style={{ color: "var(--up)" }}>
            {stats.activePositions}
          </div>
        </div>
        <div className="stat card">
          <div className="k">Total notional</div>
          <div className="v" style={{ color: "var(--navy)" }}>
            {fmtUSD(stats.totalNotional)}
          </div>
        </div>
        <div className="stat card">
          <div className="k">Settlements</div>
          <div className="v">{stats.settlements.toLocaleString("en-US")}</div>
        </div>
        <div className="stat card">
          <div className="k">
            <span className="ping" style={{ width: 6, height: 6 }} /> Current AFR
          </div>
          <div className="v" style={{ color: "var(--clay-600)" }}>
            {fmtPct(afr)}
          </div>
        </div>
      </div>

      {/* search */}
      <div className="searchwrap">
        <form className="searchbar" onSubmit={onSearchSubmit} autoComplete="off">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="m20 20-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by position #, address (0x…40), or tx hash (0x…64)"
          />
          {searchKind && (
            <span className={`kindbadge ${searchKind === "invalid" ? "err" : ""}`}>
              {KIND_LABEL[searchKind]}
            </span>
          )}
          <button type="submit" className="btn btn-primary btn-sm">
            Go
          </button>
        </form>
      </div>
      <div className="hintrow">
        <span className="chip" onClick={() => setSearch("42")}>
          #42
        </span>
        <span
          className="chip"
          onClick={() => setSearch("0x7a3f9C21b4E8d6F05a1C9e2B7d4F38a0C5e1B6d2")}
        >
          0x7a3f…B6d2
        </span>
        <span className="chip" onClick={() => setSearch("tx")}>
          a tx hash
        </span>
      </div>

      {/* chart + feed */}
      <div className="exp-grid">
        <div className="panel card">
          <div className="panel-head">
            <h3>Funding rate · BTC-PERP · 24h</h3>
            <span className="meta">
              {fmtPct(fundingStats.lo)} – {fmtPct(fundingStats.hi)}
            </span>
          </div>
          <FundingChart onHover={setHoverAfr} series={fundingSeries} />
          <div className="fstats">
            <div className="b">
              <div className="k">Current</div>
              <div className="v" style={{ color: "var(--clay-600)" }}>
                {fmtPct(shownCur)}
              </div>
            </div>
            <div className="b">
              <div className="k">24h high</div>
              <div className="v">{fmtPct(fundingStats.hi)}</div>
            </div>
            <div className="b">
              <div className="k">24h low</div>
              <div className="v">{fmtPct(fundingStats.lo)}</div>
            </div>
            <div className="b">
              <div className="k">Mean</div>
              <div className="v">{fmtPct(fundingStats.mean)}</div>
            </div>
          </div>
        </div>

        <div className="panel card">
          <div className="panel-head">
            <h3>Latest settlements</h3>
            <a
              className="meta"
              style={{ color: "var(--navy)", cursor: "pointer" }}
              onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth" })}
            >
              View all
            </a>
          </div>
          <div className="feed">
            {SETTLEMENTS.map((s, i) => {
              const credit = s.receiver === "Hedger";
              return (
                <div className="feed-row" key={i}>
                  <div className={`feed-ic ${credit ? "cr" : "db"}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d={credit ? "M12 5v14M5 12l7-7 7 7" : "M12 19V5M5 12l7 7 7-7"}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="feed-main">
                    <div className="l1">
                      <b>Position #{s.positionId}</b> · period {s.period} ·{" "}
                      <span style={{ color: "var(--clay-600)" }} className="mono">
                        AFR {fmtPct(s.afr)}
                      </span>
                    </div>
                    <div className="l2">
                      <span className="alink" onClick={() => routeAddress(s.from)}>
                        {shortAddr(s.from)}
                      </span>{" "}
                      →{" "}
                      <span className="alink" onClick={() => routeAddress(s.to)}>
                        {shortAddr(s.to)}
                      </span>{" "}
                      · {ago(s.ageSec)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className={`feed-amt ${credit ? "cr" : "db"}`}>
                      {credit ? "+" : "−"}
                      {fmtUSDfull(s.amount)}
                    </div>
                    <span
                      className="alink"
                      style={{ fontSize: 11, cursor: "pointer" }}
                      onClick={() => router.push(`/explorer/${s.positionId}`)}
                    >
                      tx {s.txHash.slice(0, 8)}…
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* positions table */}
      <div className="tablecard card" ref={tableRef}>
        <div className="tbar">
          <div className="filters">
            {(["all", "active", "closed"] as const).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="minisearch">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="var(--fg-tertiary)" strokeWidth="2" />
              <path d="m20 20-3-3" stroke="var(--fg-tertiary)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by id or address"
            />
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" data-tabular="true">
            <thead>
              <tr>
                <th className={`sortable ${sortKey === "id" ? "activesort" : ""}`} onClick={() => toggleSort("id")}>
                  Position <span className="arr">{sortArrow("id")}</span>
                </th>
                <th>Hedger</th>
                <th>LP</th>
                <th className={`sortable ${sortKey === "notional" ? "activesort" : ""}`} onClick={() => toggleSort("notional")}>
                  Notional <span className="arr">{sortArrow("notional")}</span>
                </th>
                <th className={`sortable ${sortKey === "fixedRate" ? "activesort" : ""}`} onClick={() => toggleSort("fixedRate")}>
                  Fixed rate <span className="arr">{sortArrow("fixedRate")}</span>
                </th>
                <th>Collateral</th>
                <th className={`sortable ${sortKey === "status" ? "activesort" : ""}`} onClick={() => toggleSort("status")}>
                  Status <span className="arr">{sortArrow("status")}</span>
                </th>
                <th className={`sortable ${sortKey === "startedAt" ? "activesort" : ""}`} onClick={() => toggleSort("startedAt")}>
                  Started <span className="arr">{sortArrow("startedAt")}</span>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--fg-tertiary)", padding: 40 }}>
                    No positions match.
                  </td>
                </tr>
              ) : (
                rows.map((s) => <Row key={s.id} s={s} onAddr={routeAddress} onView={() => router.push(`/explorer/${s.id}`)} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 26,
            transform: "translateX(-50%)",
            zIndex: 90,
            padding: "12px 20px",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: toast.err ? "var(--down)" : "var(--navy-900)",
            boxShadow: "var(--sh-lg)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </main>
  );
}

function Row({
  s,
  onAddr,
  onView,
}: {
  s: Position;
  onAddr: (a: string) => void;
  onView: () => void;
}) {
  const hp = s.status === "active" ? s.hedgerCollateral / s.maxCollateral : 0;
  return (
    <tr>
      <td className="num" data-label="Position">
        <b>#{s.id}</b>
      </td>
      <td data-label="Hedger">
        <span className="alink" onClick={() => onAddr(s.hedger)}>
          {shortAddr(s.hedger)}
        </span>
      </td>
      <td data-label="LP">
        <span className="alink" onClick={() => onAddr(s.lp)}>
          {shortAddr(s.lp)}
        </span>
      </td>
      <td className="num" data-label="Notional">
        {fmtUSDfull(s.notional)}
      </td>
      <td className="num rate-fixed" data-label="Fixed rate">
        {fmtPct(s.fixedRate)}
      </td>
      <td data-label="Collateral">
        {s.status === "active" ? (
          <>
            <span className="mono" style={{ fontSize: 12, color: healthColor(hp) }}>
              {Math.round(hp * 100)}%
            </span>
            <span className="healthbar">
              <i style={{ width: `${Math.round(hp * 100)}%`, background: healthColor(hp) }} />
            </span>
          </>
        ) : (
          <span style={{ color: "var(--fg-muted)" }}>—</span>
        )}
      </td>
      <td data-label="Status">
        <span className={`status status-${s.status}`}>
          <span className="dot" />
          {s.status === "active" ? "Active" : "Closed"}
        </span>
      </td>
      <td className="num" data-label="Started" style={{ color: "var(--fg-tertiary)" }}>
        {s.startedAt}
      </td>
      <td data-label="">
        <span className="viewbtn" style={{ cursor: "pointer" }} onClick={onView}>
          View →
        </span>
      </td>
    </tr>
  );
}
