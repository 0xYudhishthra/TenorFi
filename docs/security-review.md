# Keel — Security Review (internal)

Scope: `KeelSwap`, `FundingIndex`, `KeelFundingReceiver`, and the SwapVM pieces
(`FundingSettle` opcode, `KeelOpcodes`, `KeelSwapVMRouter`, `KeelFundingProgram`).
Chain: **Base mainnet** (chain id 8453).

## Test posture
- **47 tests** (45 local + 2 Base-mainnet-fork) — `forge test` (fork tests skip without `BASE_RPC_URL`).
- **Base mainnet fork integration** (`test/swapvm/BaseMainnetFork.t.sol`): deploys our router + program
  against the **real deployed Aqua** and settles with **real USDC** — proving the opcode works against
  production Aqua/USDC, plus the double-settle guard holds there.
- Settlement math, the per-period cap, no-default, and double-settle are unit-tested.

## On-chain address verification (Base mainnet, verified via `cast`)
| Contract | Address | Check |
|---|---|---|
| Aqua | `0x499943E74FB0cE105688beeE8Ef2ABec5D936d31` | has code; `SwapVM.AQUA()` returns this |
| SwapVM (canonical) | `0x8fDD04Dbf6111437B44bbca99C28882434e0958f` | has code (we deploy our **own** router, not this) |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | has code; `decimals() == 6` |

## Static analysis — Slither 0.11.5 (triage)
| Finding | Severity | Verdict |
|---|---|---|
| `arbitrary-send-erc20` — `KeelSwap.open` pulls from named parties' allowances | Medium | **Fixed** — `open()` now requires `msg.sender ∈ {hedger, speculator}` (a third party can no longer pull from arbitrary approved addresses). **Residual:** a party could still draw the *counterparty's* standing allowance with unfavourable terms — so in production the consent-safe path is the **Aqua opcode** (each side `ship`s its own strategy = per-swap consent); `KeelSwap` is the simplified fallback and should not be granted standing allowances by an LP. |
| `missing-zero-check` — `FundingIndex.forwarder`, `KeelFundingReceiver.relayer` | Low | **Accepted.** `relayer == 0` is intentional (disables the EOA fallback, per NatSpec). `forwarder` is rotatable via `setForwarder`; a zero forwarder simply disables writes (fail-safe). |
| `reentrancy-events` — events after external calls in `open`/`close`/`onReport` | Info | **Not a vuln.** Checks-Effects-Interactions is followed: `close()` sets `closed = true` and zeroes balances *before* `_push`; a re-entrant call hits the `closed`/`settled` guards. Event ordering only. |
| `timestamp` — `FundingSettle` derives `period = block.timestamp / periodSeconds` | Info | **Intentional.** A miner can nudge the timestamp by seconds, not across a 120s period boundary meaningfully; and double-settle is guarded per `(orderHash, period)`. (`_clamp`/`_abs` flags are false positives — no timestamp use.) |
| `dead-code` — `_fundingSettle`/`_clamp`/`_abs` "never used" | Info | **False positive.** Used via the opcode function-pointer array and inheritance, which Slither doesn't trace. Covered by tests. |
| `missing-inheritance` — `FundingIndex` should inherit `IFundingIndex` | Info | **Style.** Functionally satisfied (duck-typed; consumers use the interface). |

## Design-level safety invariants (verified by tests)
- **No-default:** per-period settlement is clamped to `cap × notional`, and each side pre-locks at least
  that; settlement only *moves* collateral (sum conserved), so a credited party is always fully backed.
- **Write-once funding index:** a period's realized funding is immutable once latched; only the
  `KeelFundingReceiver` (the `FundingIndex.forwarder`) can write; duplicate DON deliveries are skipped,
  not reverted (can't brick the forwarder).
- **No double-settle:** the opcode guards `(orderHash, period)` (skipped during static quoting).
- **Protocol neutrality:** the contracts only custody + settle; the LP provides liquidity and bears the
  bounded directional risk.

## Deep audit pass (solidity-auditor, 4 vector agents + adversarial) — findings & resolutions

A second, adversarial pass surfaced two protocol-logic bugs in the SwapVM path that Slither and the
happy-path fork test missed. All actionable findings are now fixed; tests added for each.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| A | High | **Any address could take the settlement order and steal the LP's payout** (order not bound to the counterparty) | **Fixed** — `_fundingSettle` binds the order to a `counterparty` and reverts `UnauthorizedTaker` if `ctx.query.taker != counterparty`. Test: `test_strangerCannotTake`. |
| B | High | **Opcode dropped the sign of `R − F`** → maker paid in both directions / drainable | **Fixed** — settlement is now directional: each leg has `makerPaysAbove`; an order pays only in its own direction (0 otherwise). A Keel position is two mirror orders. Tests: `test_wrongDirection_paysZero`, `test_makerPaysBelow_RBelowF_pays`. |
| 1 | Med-High | **USDC blacklisting locks all collateral in `close()`** | **Fixed** — pull-over-push: `close()` credits `claimable[party]`; each party `withdraw()`s independently. |
| 4 | Med | **Early `close()` skips unsettled periods** | **Acknowledged / by-design** — settlement is permissionless, so the counterparty can settle any *latched* period before a close; early close only forfeits future *un-latched* periods (normal early termination). A settle-before-close guard was tried and reverted because it breaks the no-default path (a drained side's period cannot be settled). |
| 5 | Med | **`open()` pulls counterparty's full approval into unagreed terms** | **Partially mitigated** (participant guard); residual documented above — the consent-safe path is the Aqua opcode (now also taker-bound). |
| 6 | Low | **Dust notional → zero min-collateral** | **Fixed** — `open()` reverts when `maxPeriodAmount == 0`. |
| 7 | Low | **`setForwarder(0)` bricks funding writes** | **Fixed** — zero-address check added. |
| 8 | Low | **Bare `require` on transfer (non-standard ERC20)** | **Accepted** — Base USDC returns `bool`; `SafeERC20` is a nice-to-have, not required for the chosen collateral. |

**Test count after fixes: 50** (48 offline + 2 Base-mainnet fork). New: directional settlement, taker-bind, stranger-cannot-take, pull-over-push withdraw.

## Known limitations / out of scope
- **KeelSwap counterparty-allowance consent** (see the Medium above) — use the Aqua opcode path in production.
- **Oracle staleness / liveness** — if CRE/relayer stops writing, settlement halts for that period (funds safe; not lost). The receiver's relayer fallback mitigates liveness.
- **LP directional risk** — real but bounded per period; this is the protocol's economic design, not a bug.
- A formal external audit has **not** been performed; this is an internal review for a hackathon build.
