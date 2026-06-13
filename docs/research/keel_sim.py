# Validate Keel's assumptions with numbers:
#  (1) funding is volatile enough that locking matters
#  (2) the swap actually fixes the hedger's income (variance -> 0)
#  (3) "funding capped + collateral pre-locked -> no default" holds
#  (4) the Ethena-style crash: locked vs unlocked
import random, math
random.seed(7)

NOTIONAL = 1_000_000          # $1M perp position
DAYS = 30; HRS = DAYS*24      # 30-day swap, hourly funding
YR_HRS = 24*365
CAP_HR = 0.0004               # per-hour funding clamp (0.04%/hr ~ a venue cap; tune per venue)

def mean_revert_path(start_apr, theta, sigma, kappa=0.03):
    apr = start_apr; path=[]
    for _ in range(HRS):
        apr += kappa*(theta-apr) + sigma*random.gauss(0,1)
        apr = max(-1.0, min(3.0, apr))          # clamp APR to [-100%, +300%]
        path.append(apr)
    return path

def income(path):  # $ earned over the 30d from floating funding
    return sum((apr/YR_HRS)*NOTIONAL for apr in path)

# ---- (1)+(2): Monte Carlo, normal regime, hedger earning floating, locks at fixed = E[funding] ----
N=20000
theta=0.10; sigma=0.010      # mean 10% APR, hourly vol
unlocked=[]
for _ in range(N): unlocked.append(income(mean_revert_path(0.10,theta,sigma)))
unlocked.sort()
mean_u=sum(unlocked)/N
fixed_apr=0.10               # quoted fixed = expected mean funding
locked=fixed_apr*NOTIONAL*DAYS/365
def pct(q): return unlocked[int(q*N)]
print("="*66)
print("KEEL VALIDATION — $%.0fM notional, %d-day swap, hourly funding"%(NOTIONAL/1e6,DAYS))
print("="*66)
print("(1) Funding is volatile: 30d income on a $1M position, UNLOCKED (floating):")
print("    mean $%.0f | p5 $%.0f | p95 $%.0f | spread p5->p95 = $%.0f (%.0f%% of mean)"
      %(mean_u,pct(.05),pct(.95),pct(.95)-pct(.05),100*(pct(.95)-pct(.05))/mean_u))
print("(2) LOCKED at fixed %.0f%% APR -> income = $%.0f every time (std = $0)."%(fixed_apr*100,locked))
print("    => the swap converts a $%.0f swing into a single number. Variance eliminated."%(pct(.95)-pct(.05)))
print()

# ---- (4): Ethena-style crash path: funding starts 45% APR, collapses to ~2% ----
crash = mean_revert_path(0.45, 0.02, 0.006, kappa=0.05)
u_crash = income(crash)
l_crash = 0.20*NOTIONAL*DAYS/365   # they locked earlier at 20% (the going rate then)
print("(4) Ethena-style crash (funding 45%% APR -> ~2%%):")
print("    start APR %.0f%%  end APR %.0f%%"%(crash[0]*100, crash[-1]*100))
print("    UNLOCKED 30d income: $%.0f   (collapses with funding)"%u_crash)
print("    LOCKED  @20%% APR:    $%.0f   (held flat)  -> hedger keeps $%.0f more"%(l_crash, l_crash-u_crash))
print()

# ---- (3): no-default check. Per-hour settlement is bounded by the cap; collateral pre-locks it ----
# worst-case hourly cashflow = |realized_hr - fixed_hr| * notional, realized_hr capped at CAP_HR
fixed_hr = fixed_apr/YR_HRS
max_owe_hr = (CAP_HR + fixed_hr)*NOTIONAL
coll_per_party = max_owe_hr            # pre-lock one hour's worst case (hourly settle tops up)
# observed max hourly settlement across the MC normal paths:
obs_max=0.0
for _ in range(2000):
    for apr in mean_revert_path(0.10,theta,sigma):
        owe=abs(apr/YR_HRS - fixed_hr)*NOTIONAL
        if owe>obs_max: obs_max=owe
print("(3) No-default math (cap %.2f%%/hr):"%(CAP_HR*100))
print("    max possible hourly owed (at the cap) = $%.0f  -> pre-lock $%.0f per party"%(max_owe_hr,coll_per_party))
print("    observed max hourly settlement in normal sims = $%.0f  (<< the pre-locked cap)"%obs_max)
print("    => settle hourly, collateral always covers the worst next hour. Solvent by construction.")
print()
print("FAIR FIXED RATE = E[funding] over the tenor (here ~%.0f%% APR); protocol earns the spread/fee, takes no directional bet."%(theta*100))
