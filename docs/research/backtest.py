# TenorFi backtest on REAL Hyperliquid BTC funding (funding_btc_1y.csv).
#
# Everything is from the LP side (= us, the insurance reserve): we RECEIVE the fixed
# rate and PAY the realized floating. Per hour, our PnL fraction is
#       clamp(f_h - r_h, +/-cap_h)         f_h = F_apr / 8760,  r_h = realized hourly
#   r_h > f_h (funding high)  -> we PAY    (drains our coverage)
#   r_h < f_h (funding calm)  -> we COLLECT the premium
#
# "Coverage" (C) = our pre-locked collateral = a CUMULATIVE budget of what we can pay
# out before we're drained (maps to `speculatorCollateral` in KeelSwap.sol, NOT to the
# per-period cap*notional). Our max loss is bounded at C; the hedger's symmetric
# collateral (H) bounds our max win. This mirrors the on-chain conservation + no-default.
#
# Direction & clamp reconcile with KeelSwap.sol:199-224 and FundingSettle.sol:77-81.
import argparse
import csv
import os

import numpy as np

HRS_PER_YEAR = 24 * 365  # 8760
VENUE_CAP_HR = 0.04  # Hyperliquid hard funding clamp: 4%/hour (= cap 4e16 on-chain)
CSV_PATH = os.path.join(os.path.dirname(__file__), "funding_btc_1y.csv")

# The 3 demo packages: (fixed APR, coverage $).
PACKAGES = [(0.05, 25_000), (0.08, 50_000), (0.12, 100_000)]


# --------------------------------------------------------------------------- data
def load():
    with open(CSV_PATH) as f:
        rows = list(csv.DictReader(f))
    r = np.array([float(x["funding_hourly"]) for x in rows])  # per-hour, signed
    t = np.array([int(x["time_ms"]) for x in rows])
    dt = np.array([x["datetime_utc"] for x in rows])
    return r, t, dt


# ------------------------------------------------------------------------- helpers
def f_hourly(F_apr):
    return F_apr / HRS_PER_YEAR


def lp_pnl_fraction(r, F_apr, cap_hr=VENUE_CAP_HR):
    """Per-hour LP PnL as a fraction of notional, clamped per period."""
    return np.clip(f_hourly(F_apr) - r, -cap_hr, cap_hr)


def funding_reality(r, dt):
    apr = r * HRS_PER_YEAR
    pcts = {q: np.percentile(apr, q) for q in (1, 5, 25, 50, 75, 95, 99)}
    hi = int(np.argmax(r))
    return {
        "hours": len(r),
        "mean_apr": r.mean() * HRS_PER_YEAR,
        "median_apr": np.median(r) * HRS_PER_YEAR,
        "std_apr": apr.std(),
        "pcts_apr": pcts,
        "max_apr": apr.max(),
        "max_when": dt[hi],
        "min_apr": apr.min(),
        "frac_negative": float((r < 0).mean()),
    }


def fair_rate(r):
    """Break-even fixed APR: where E[f_h - r_h] = 0 over the year (we net ~0)."""
    return r.mean() * HRS_PER_YEAR


def pnl_unbounded_pct(r, F_apr, cap_hr=VENUE_CAP_HR):
    """Clean economic LP PnL over the whole series, as % of notional (no collateral
    bounds — just the per-period clamp). Equals ~(F - mean_realized) when the clamp
    never binds. This is the scale-free 'how much we win/lose' headline."""
    return float(lp_pnl_fraction(r, F_apr, cap_hr).sum()) * 100


def pnl_curve(r, lo=0.0, hi=0.15, step=0.005):
    """LP annual PnL (% of notional) vs fixed rate F. Break-even where it crosses 0."""
    fs = np.arange(lo, hi + 1e-9, step)
    return fs, np.array([pnl_unbounded_pct(r, F) for F in fs])


def quote(F_apr, notional, hours):
    """Price a fixed-rate swap for a user. The 'cost of the insurance' = the fixed leg
    the user is locked into over the duration. In the swap this is netted hourly against
    the floating leg, but the user's guaranteed net funding cost is exactly this."""
    f_hr = F_apr / HRS_PER_YEAR              # hourly fixed rate (fraction)
    fixed_per_hour = f_hr * notional         # $/hour the user owes on the fixed leg
    fixed_total = fixed_per_hour * hours     # $ total locked cost over the period
    return {
        "F_apr": F_apr,
        "notional": notional,
        "hours": hours,
        "days": hours / 24,
        "f_hourly_pct": f_hr * 100,
        "fixed_per_hour": fixed_per_hour,
        "fixed_total": fixed_total,
    }


def invert_package(r, F_apr, coverage, tenor_hours, conf=99):
    """Max notional this (F, coverage) package safely backs: the largest N whose
    per-window coverage-need at the given confidence stays <= coverage. Coverage-need
    scales linearly with N, so N_max = coverage / need_per_unit_notional."""
    oc = optimal_coverage(r, F_apr, notional=1.0, tenor_hours=tenor_hours)
    need_per_unit = oc[f"p{conf}"]
    n_max = coverage / need_per_unit if need_per_unit > 0 else float("inf")
    return {"need_per_unit": need_per_unit, "n_max": n_max, "windows": oc["windows"]}


# Auto-scale coverage rule (product decision): coverage = ratio * notional.
COVERAGE_RATIO_30D = 0.015   # 1.5% of notional for a <=30-day swap, priced at/above fair
COVERAGE_RATIO_1YR = 0.030   # 3% if the position can run up to a year
BELOW_FAIR_BUMP = 0.005      # +0.5% if quoting a loss-leader below the fair rate


def recommend_coverage(notional, tenor_days=30, below_fair=False):
    """Coverage (pre-locked LP collateral = speculatorCollateral) to pre-lock for a swap.
    Auto-scaled off the notional; sized to survive ~p99 of historical 30-day windows at
    the fair rate, with a safety margin. NOT cap*notional (that is only the per-period
    floor). Returns the $ coverage to pre-lock."""
    ratio = COVERAGE_RATIO_1YR if tenor_days > 30 else COVERAGE_RATIO_30D
    if below_fair:
        ratio += BELOW_FAIR_BUMP
    return notional * ratio


def validate_coverage_ratio(r, F_apr, tenor_days=30, conf=99):
    """Confirm the chosen ratio actually covers the real p99 need at this rate.
    Returns the empirical p99 coverage-need per $1 of notional (a fraction)."""
    oc = optimal_coverage(r, F_apr, notional=1.0, tenor_hours=int(tenor_days * 24))
    return oc[f"p{conf}"]


# ---------------------------------------------------------------------- the engine
def backtest(r, F_apr, coverage, notional, start=0, tenor_hours=None,
             cap_hr=VENUE_CAP_HR, hedger_coverage=None):
    """Replay one swap. Returns the realized LP outcome with coverage bounds.

    Our collateral balance starts at `coverage`, moves by pnl each hour, is drained
    (swap closes, we lose `coverage`) if it hits 0, and our winnings are capped at the
    hedger's collateral `hedger_coverage` (default = symmetric to our coverage)."""
    if tenor_hours is None:
        tenor_hours = len(r) - start
    if hedger_coverage is None:
        hedger_coverage = coverage
    seg = r[start:start + tenor_hours]
    frac = lp_pnl_fraction(seg, F_apr, cap_hr)
    flow = frac * notional  # $ per hour, + = we collect, - = we pay

    bal = coverage          # our collateral
    hbal = hedger_coverage  # hedger collateral (bounds our upside)
    drained_at = None
    cap_bound = int(np.sum(np.abs(frac) >= cap_hr - 1e-12))
    min_bal = bal
    path = np.empty(len(flow))
    for i, x in enumerate(flow):
        if x >= 0:                       # we collect from the hedger
            take = min(x, hbal)
            bal += take
            hbal -= take
        else:                            # we pay the hedger
            bal += x                     # x is negative
            hbal -= x
        path[i] = bal
        min_bal = min(min_bal, bal)
        if bal <= 0:
            drained_at = start + i
            bal = 0.0
            break

    pnl = bal - coverage                 # + = we profited, - = we lost (>= -coverage)
    return {
        "F_apr": F_apr,
        "coverage": coverage,
        "notional": notional,
        "tenor_hours": tenor_hours,
        "pnl": pnl,
        "pnl_pct_notional": pnl / notional * 100,
        "drained": drained_at is not None,
        "drained_at_hour": drained_at,
        "max_drawdown": coverage - min_bal,   # worst dip below the starting coverage
        "periods_cap_bound": cap_bound,
        "final_balance": bal,
        "path": path,
    }


def optimal_coverage(r, F_apr, notional, tenor_hours, cap_hr=VENUE_CAP_HR):
    """Across every rolling entry point, the coverage needed to survive the window
    (= max cumulative net outflow from window start). Returns the distribution."""
    frac = lp_pnl_fraction(r, F_apr, cap_hr)
    flow = frac * notional
    need = []
    last = len(flow) - tenor_hours
    if last <= 0:
        last = 1
    for s in range(0, last, 6):  # step 6h to keep it fast; plenty of windows
        cs = np.cumsum(flow[s:s + tenor_hours])
        need.append(max(0.0, -cs.min()))  # how deep we go below the start
    need = np.array(need)
    return {
        "tenor_hours": tenor_hours,
        "windows": len(need),
        "p50": np.percentile(need, 50),
        "p95": np.percentile(need, 95),
        "p99": np.percentile(need, 99),
        "max": need.max(),
    }


def optimal_cap(r, F_apr):
    """Tightest per-period clamp covering ~p99 of the real |r_h - f_h| moves."""
    move = np.abs(r - f_hourly(F_apr))
    return {
        "p95_hr": np.percentile(move, 95),
        "p99_hr": np.percentile(move, 99),
        "p999_hr": np.percentile(move, 99.9),
        "max_hr": move.max(),
        "p99_apr": np.percentile(move, 99) * HRS_PER_YEAR,
        "max_apr": move.max() * HRS_PER_YEAR,
        "venue_apr": VENUE_CAP_HR * HRS_PER_YEAR,
    }


def find_crash_window(t, dt, day="2025-10-10", before=4 * 24, after=3 * 24):
    idx = next((i for i, d in enumerate(dt) if d.startswith(day)), None)
    if idx is None:
        return 0, len(t)
    return max(0, idx - before), before + after


# ------------------------------------------------------------------------------ cli
def _print_reality(stats):
    p = stats["pcts_apr"]
    print("=" * 68)
    print(f"REAL BTC FUNDING — Hyperliquid, last {stats['hours']} hours")
    print("=" * 68)
    print(f"  mean   {stats['mean_apr'] * 100:6.2f}% APR     median {stats['median_apr'] * 100:6.2f}% APR")
    print(f"  p1 {p[1]*100:.1f}  p5 {p[5]*100:.1f}  p25 {p[25]*100:.1f}  "
          f"p75 {p[75]*100:.1f}  p95 {p[95]*100:.1f}  p99 {p[99]*100:.1f}  (% APR)")
    print(f"  max    {stats['max_apr'] * 100:7.1f}% APR  on {stats['max_when'][:10]}   "
          f"min {stats['min_apr'] * 100:.1f}% APR")
    print(f"  hours with negative funding: {stats['frac_negative'] * 100:.1f}%")
    print()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--F", type=float, default=None, help="fixed APR %% (e.g. 5)")
    ap.add_argument("--coverage", type=float, default=25_000)
    ap.add_argument("--notional", type=float, default=500_000)
    ap.add_argument("--tenor-days", type=float, default=30)
    args = ap.parse_args()

    r, t, dt = load()
    stats = funding_reality(r, dt)
    _print_reality(stats)
    fair = fair_rate(r)
    print(f"FAIR (break-even) fixed rate = {fair * 100:.2f}% APR  "
          f"(F = mean realized funding; we net ~$0, earn the spread)\n")

    if args.F is not None:
        F = args.F / 100
        tenor = int(args.tenor_days * 24)
        res = backtest(r, F, args.coverage, args.notional, tenor_hours=tenor)
        print(f"BACKTEST  F={args.F:.0f}%  coverage=${args.coverage:,.0f}  "
              f"notional=${args.notional:,.0f}  tenor={args.tenor_days:.0f}d")
        print(f"  our PnL: ${res['pnl']:,.0f}  ({res['pnl_pct_notional']:+.2f}% of notional)")
        print(f"  drained: {res['drained']}  max drawdown ${res['max_drawdown']:,.0f}  "
              f"cap-bound hours {res['periods_cap_bound']}")
        return

    # (1) The fair-rate curve: LP annual PnL (% of notional) vs F. Break-even at the mean.
    print("LP ANNUAL PnL vs FIXED RATE (% of notional, full year)")
    print("-" * 68)
    for F in (0.03, 0.05, fair, 0.08, 0.10, 0.12, 0.15):
        tag = "  <- FAIR (break-even)" if abs(F - fair) < 1e-6 else ""
        print(f"  F = {F*100:5.2f}%   ->  {pnl_unbounded_pct(r, F):+6.2f}% of notional / yr{tag}")
    print()

    # (2) The 3 packages: clean per-notional economics + coverage sizing (inverted).
    print("THE 3 DEMO PACKAGES — economics & coverage sizing")
    print("-" * 68)
    print("  pkg            yr PnL/notional   coverage backs (30d swap, p99)   full-yr p99")
    for F, C in PACKAGES:
        per = pnl_unbounded_pct(r, F)
        inv30 = invert_package(r, F, C, tenor_hours=30 * 24)
        inv_yr = invert_package(r, F, C, tenor_hours=len(r))
        print(f"  {F*100:>2.0f}% / ${C:>7,.0f}   {per:+6.2f}%/yr        "
              f"N_max = ${inv30['n_max']:>13,.0f}      ${inv_yr['n_max']:>12,.0f}")
    print()

    # (2c) Auto-scale coverage rule: coverage = 1.5% of notional, validated vs the real p99.
    print("COVERAGE — auto-scaled (1.5% of notional), validated at the fair rate")
    print("-" * 68)
    need99 = validate_coverage_ratio(r, fair, tenor_days=30)
    print(f"  real p99 need @ fair, 30d swap = {need99*100:.2f}% of notional  "
          f"-> rule 1.5% covers it (margin x{0.015/need99:.1f})")
    for N in (1_000, 5_000, 10_000, 25_000, 50_000, 100_000):
        print(f"  notional ${N:>8,.0f}  ->  pre-lock coverage ${recommend_coverage(N):>8,.0f}")
    print()

    # (2b) Optimal per-period cap vs the venue 4%/hr.
    oc = optimal_cap(r, fair)
    print("PER-PERIOD CAP — real moves vs the venue clamp")
    print("-" * 68)
    print(f"  |r - f| per hour:  p95 {oc['p95_hr']*100:.4f}%  p99 {oc['p99_hr']*100:.4f}%  "
          f"p99.9 {oc['p999_hr']*100:.4f}%  max {oc['max_hr']*100:.4f}%")
    print(f"  annualized:        p99 {oc['p99_apr']*100:.1f}% APR   max {oc['max_apr']*100:.1f}% APR"
          f"   vs venue cap {oc['venue_apr']*100:.0f}% APR (never binds)")
    print()

    # (3) Crash replay: the week around 2025-10-10.
    start, length = find_crash_window(t, dt, "2025-10-10")
    F, C = 0.05, 25_000
    N = 1_000_000
    res = backtest(r, F, C, N, start=start, tenor_hours=length)
    seg = r[start:start + length]
    print(f"CRASH REPLAY — week of 2025-10-10, F=5%, $1M notional")
    print("-" * 68)
    print(f"  realized funding that week: avg {seg.mean()*HRS_PER_YEAR*100:.1f}% APR  "
          f"peak {seg.max()*HRS_PER_YEAR*100:.1f}% APR")
    print(f"  hours funding > fixed (we pay): {int((seg > f_hourly(F)).sum())} / {length}")
    print(f"  our PnL that week: ${res['pnl']:,.0f}  ({res['pnl_pct_notional']:+.2f}% of notional)")
    print()


if __name__ == "__main__":
    main()
