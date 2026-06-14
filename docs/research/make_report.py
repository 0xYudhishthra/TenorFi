# Generate the 3 figures + a verified numbers block for analysis.md.
# Run after fetch_funding.py:  python make_report.py
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime, timezone

import backtest as bt

HERE = os.path.dirname(__file__)
INK = "#0e0e12"
VIOLET = "#6c5ce7"
GREEN = "#16a34a"
RED = "#dc2626"
GREY = "#9aa0a6"


def _save(fig, name):
    path = os.path.join(HERE, name)
    fig.savefig(path, dpi=130, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("wrote", name)


def fig_funding(r, t, dt):
    dates = [datetime.fromtimestamp(x / 1000, tz=timezone.utc) for x in t]
    apr = r * bt.HRS_PER_YEAR * 100
    mean = apr.mean()
    med = np.median(apr)
    fig, ax = plt.subplots(figsize=(11, 4.2))
    ax.plot(dates, apr, lw=0.5, color=VIOLET, alpha=0.85)
    ax.axhline(mean, color=RED, lw=1.2, ls="--", label=f"mean {mean:.1f}% (fair fixed)")
    ax.axhline(med, color=GREEN, lw=1.0, ls=":", label=f"median {med:.1f}%")
    ax.axhline(0, color=GREY, lw=0.6)
    hi = int(np.argmax(r))
    ax.annotate(f"  Oct-10 crash: {apr[hi]:.0f}% APR (1h)",
                xy=(dates[hi], apr[hi]), xytext=(dates[hi], apr[hi] - 40),
                color=INK, fontsize=9, arrowprops=dict(arrowstyle="->", color=INK))
    ax.set_title("BTC perp funding — Hyperliquid, last 12 months (annualized)", fontsize=12)
    ax.set_ylabel("funding (% APR)")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b '%y"))
    ax.legend(loc="upper left", fontsize=9, frameon=False)
    ax.grid(alpha=0.15)
    _save(fig, "funding_1y.png")


def fig_pnl_vs_F(r):
    fs, ys = bt.pnl_curve(r, 0.0, 0.16, 0.0025)
    fair = bt.fair_rate(r)
    fig, ax = plt.subplots(figsize=(8, 4.6))
    ax.axhline(0, color=GREY, lw=0.8)
    ax.plot(fs * 100, ys, color=VIOLET, lw=2.2)
    ax.axvline(fair * 100, color=RED, ls="--", lw=1.2, label=f"fair / break-even = {fair*100:.2f}%")
    for F, C in bt.PACKAGES:
        y = bt.pnl_unbounded_pct(r, F)
        col = GREEN if y >= 0 else RED
        ax.scatter([F * 100], [y], color=col, zorder=5, s=45)
        ax.annotate(f"{F*100:.0f}% pkg\n{y:+.2f}%/yr", (F * 100, y),
                    textcoords="offset points", xytext=(8, -4 if y > 0 else 8), fontsize=8.5)
    ax.set_title("Our (LP) annual PnL vs the fixed rate we quote", fontsize=12)
    ax.set_xlabel("fixed rate F (% APR)")
    ax.set_ylabel("LP PnL (% of notional / yr)")
    ax.legend(loc="upper left", fontsize=9, frameon=False)
    ax.grid(alpha=0.15)
    _save(fig, "pnl_vs_F.png")


def fig_pnl_distribution(r):
    """Distribution of 30-day swap PnL per $1M notional, for each package's F."""
    tenor = 30 * 24
    N = 1_000_000
    fig, ax = plt.subplots(figsize=(8.5, 4.6))
    colors = {0.05: RED, 0.08: VIOLET, 0.12: GREEN}
    for F, _C in bt.PACKAGES:
        frac = bt.lp_pnl_fraction(r, F)
        flow = frac * N
        pnls = []
        for s in range(0, len(flow) - tenor, 6):
            pnls.append(flow[s:s + tenor].sum())
        pnls = np.array(pnls)
        ax.hist(pnls, bins=60, alpha=0.5, color=colors[F],
                label=f"F={F*100:.0f}%  (mean ${pnls.mean():,.0f})")
        ax.axvline(pnls.mean(), color=colors[F], lw=1.2, ls="--")
    ax.axvline(0, color=INK, lw=0.8)
    ax.set_title("Our PnL per 30-day swap, $1M notional (every rolling entry)", fontsize=12)
    ax.set_xlabel("LP PnL over the swap ($)")
    ax.set_ylabel("# of rolling windows")
    ax.legend(fontsize=9, frameon=False)
    ax.grid(alpha=0.15)
    _save(fig, "pnl_distribution.png")


def main():
    r, t, dt = bt.load()
    fig_funding(r, t, dt)
    fig_pnl_vs_F(r)
    fig_pnl_distribution(r)


if __name__ == "__main__":
    main()
