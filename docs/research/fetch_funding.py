# Fetch ~12 months of hourly BTC funding from Hyperliquid -> funding_btc_1y.csv
# Public endpoint, no API key. Idempotent: skips the download if the CSV already
# covers the requested range. The `fundingRate` field is the per-hour rate (signed).
#
#   POST https://api.hyperliquid.xyz/info
#   {"type":"fundingHistory","coin":"BTC","startTime":<ms>,"endTime":<ms>}
#   -> [{coin, fundingRate, premium, time(ms)}]   (~500 records/call, paginate by time)
import csv
import os
import time
from datetime import datetime, timezone

import requests

COIN = "BTC"
HRS_PER_YEAR = 24 * 365  # 8760
URL = "https://api.hyperliquid.xyz/info"
CSV_PATH = os.path.join(os.path.dirname(__file__), "funding_btc_1y.csv")
HOUR_MS = 3_600_000


def _post(start_ms, end_ms):
    body = {"type": "fundingHistory", "coin": COIN, "startTime": start_ms, "endTime": end_ms}
    for attempt in range(5):
        r = requests.post(URL, json=body, timeout=30)
        if r.status_code == 200:
            return r.json()
        time.sleep(1.5 * (attempt + 1))  # backoff on rate-limit / transient
    r.raise_for_status()


def fetch(months=12):
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = now_ms - int(months * 30.4375 * 24 * HOUR_MS)

    rows = {}  # time_ms -> record (dedupe across paginated calls)
    cursor = start_ms
    calls = 0
    while cursor < now_ms:
        batch = _post(cursor, now_ms)
        calls += 1
        if not batch:
            break
        for rec in batch:
            rows[int(rec["time"])] = rec
        last = max(int(rec["time"]) for rec in batch)
        if last <= cursor:  # no forward progress -> done
            break
        cursor = last + 1
        time.sleep(0.25)  # be gentle with the public endpoint

    ordered = [rows[t] for t in sorted(rows)]
    print(f"fetched {len(ordered)} hourly records in {calls} calls")
    return ordered


def write_csv(records):
    with open(CSV_PATH, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["time_ms", "datetime_utc", "funding_hourly", "premium"])
        for rec in records:
            t = int(rec["time"])
            dt = datetime.fromtimestamp(t / 1000, tz=timezone.utc).isoformat()
            w.writerow([t, dt, rec["fundingRate"], rec.get("premium", "")])
    print(f"wrote {CSV_PATH}")


def sanity(records):
    if not records:
        print("!! no records")
        return
    rates = [float(r["fundingRate"]) for r in records]
    times = sorted(int(r["time"]) for r in records)
    n = len(rates)
    mean_hr = sum(rates) / n
    gaps = [(times[i + 1] - times[i]) for i in range(len(times) - 1)]
    big_gaps = sum(1 for g in gaps if g > 2 * HOUR_MS)
    first = datetime.fromtimestamp(times[0] / 1000, tz=timezone.utc).date()
    last = datetime.fromtimestamp(times[-1] / 1000, tz=timezone.utc).date()
    hi = max(rates)
    hi_t = datetime.fromtimestamp(times[rates.index(hi)] / 1000, tz=timezone.utc).date()
    print("-" * 60)
    print(f"range            {first} -> {last}  ({n} hours)")
    print(f"gaps >2h         {big_gaps}")
    print(f"mean funding     {mean_hr:.8f}/hr  ->  {mean_hr * HRS_PER_YEAR * 100:.2f}% APR")
    print(f"max funding      {hi:.6f}/hr  ->  {hi * HRS_PER_YEAR * 100:.1f}% APR  on {hi_t}")
    print(f"min funding      {min(rates):.6f}/hr  ->  {min(rates) * HRS_PER_YEAR * 100:.1f}% APR")
    print("-" * 60)


def main():
    if os.path.exists(CSV_PATH):
        with open(CSV_PATH) as f:
            existing = list(csv.DictReader(f))
        if len(existing) > 8000:
            print(f"{CSV_PATH} already present ({len(existing)} rows); skipping fetch.")
            sanity([{"fundingRate": r["funding_hourly"], "time": r["time_ms"]} for r in existing])
            return
    records = fetch(12)
    write_csv(records)
    sanity(records)


if __name__ == "__main__":
    main()
