# TenorFi — Security Review (internal)

Scope: `FundingIndex`, `KeelFundingReceiver`, and the SwapVM settlement pieces
(`FundingSettle` opcode, `KeelOpcodes`, `KeelSwapVMRouter`, `KeelFundingProgram`).
Chain: **Base mainnet** (chain id 8453).

> **Architecture note (settlement is Aqua-only).** The custodial plain-Solidity settlement core
> (`KeelSwap`) was **removed**. All settlement now runs through the `_fundingSettle` SwapVM opcode over
> Aqua, where each side ships its own collateral as a virtual balance (per-swap consent; collateral
> never custodied). Findings that were specific to `KeelSwap` are marked **Resolved by removal** below.

## Test posture
- **35 tests** (33 local + 2 Base-mainnet-fork) — `forge test` (fork tests skip without `BASE_RPC_URL`).
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
| `arbitrary-send-erc20` — `KeelSwap.open` pulls from named parties' allowances | Medium | **Resolved by removal** — `KeelSwap` (the custodial path) was deleted. Settlement is Aqua-only: each side `ship`s its own strategy, so there is no standing-allowance pull and no third-party pull surface (per-swap consent). |
| `missing-zero-check` — `FundingIndex.forwarder`, `KeelFundingReceiver.relayer` | Low | **Accepted.** `relayer == 0` is intentional (disables the EOA fallback, per NatSpec). `forwarder` is rotatable via `setForwarder`; a zero forwarder simply disables writes (fail-safe). |
| `reentrancy-events` — event after external call in `onReport` | Info | **Not a vuln.** `onReport` writes the latch then emits; the write-once `isSet` guard makes a re-entrant duplicate a no-op. Event ordering only. |
| `timestamp` — `FundingSettle` derives `period = block.timestamp / periodSeconds` | Info | **Intentional.** A miner can nudge the timestamp by seconds, not across a 120s period boundary meaningfully; and double-settle is guarded per `(orderHash, period)`. (`_clamp`/`_abs` flags are false positives — no timestamp use.) |
| `dead-code` — `_fundingSettle`/`_clamp`/`_abs` "never used" | Info | **False positive.** Used via the opcode function-pointer array and inheritance, which Slither doesn't trace. Covered by tests. |
| `missing-inheritance` — `FundingIndex` should inherit `IFundingIndex` | Info | **Style.** Functionally satisfied (duck-typed; consumers use the interface). |

## Design-level safety invariants (verified by tests)
- **No-default (Aqua path):** per-period payout is clamped to `cap × notional` in the opcode, and each
  side ships at least that as its Aqua virtual balance; Aqua can never push tokens a maker didn't ship,
  so a settlement that would exceed the shipped balance reverts rather than creating unbacked debt — a
  credited taker is always fully backed (`test_noDefault_shipFloorCoversWorstCase_underfundedPeriodReverts`).
- **Write-once funding index:** a period's realized funding is immutable once latched; only the
  `KeelFundingReceiver` (the `FundingIndex.forwarder`) can write; duplicate DON deliveries are skipped,
  not reverted (can't brick the forwarder).
- **No double-settle:** the opcode guards `(orderHash, period)` (skipped during static quoting).
- **Protocol neutrality:** the contracts only match + settle (no house position; no custody — collateral
  stays in each party's wallet as an Aqua virtual balance); the insurance reserve provides liquidity and bears the
  bounded directional risk.

## Deep audit pass (solidity-auditor, 4 vector agents + adversarial) — findings & resolutions

A second, adversarial pass surfaced two protocol-logic bugs in the SwapVM path that Slither and the
happy-path fork test missed. All actionable findings are now fixed; tests added for each.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| A | High | **Any address could take the settlement order and steal the reserve's payout** (order not bound to the counterparty) | **Fixed** — `_fundingSettle` binds the order to a `counterparty` and reverts `UnauthorizedTaker` if `ctx.query.taker != counterparty`. Test: `test_strangerCannotTake`. |
| B | High | **Opcode dropped the sign of `R − F`** → maker paid in both directions / drainable | **Fixed** — settlement is now directional: each leg has `makerPaysAbove`; an order pays only in its own direction (0 otherwise). A TenorFi position is two mirror orders. Tests: `test_wrongDirection_paysZero`, `test_makerPaysBelow_RBelowF_pays`. |
| 1 | Med-High | **USDC blacklisting locks all collateral in `KeelSwap.close()`** | **Resolved by removal** — `KeelSwap` deleted; the Aqua path never custodies collateral (virtual balances stay in the owner's wallet), so there is no pooled `close()` to block. |
| 4 | Med | **Early `KeelSwap.close()` skips unsettled periods** | **Resolved by removal** — `KeelSwap` deleted. On the Aqua path each period is an independent shipped-order settlement; closing = stop shipping / withdraw the remaining virtual balance. |
| 5 | Med | **`KeelSwap.open()` pulls counterparty's full approval into unagreed terms** | **Resolved by removal** — `KeelSwap` deleted. On the Aqua path each side `ship`s its own strategy (per-swap consent) and the order is taker-bound, so there is no counterparty-allowance pull. |
| 6 | Low | **Dust notional → zero min-collateral in `KeelSwap.open()`** | **Resolved by removal** — `KeelSwap` deleted. On the Aqua path a maker who ships below `cap × notional` simply can't cover a worst-case period (settlement reverts; no unbacked debt) — `test_noDefault_shipFloorCoversWorstCase_underfundedPeriodReverts`. |
| 7 | Low | **`setForwarder(0)` bricks funding writes** | **Fixed** — zero-address check added in `FundingIndex.setForwarder` (still in scope). |
| 8 | Low | **Bare `require` on transfer (non-standard ERC20)** | **Resolved by removal** — the bare transfers were in `KeelSwap` (deleted). The Aqua path uses Aqua's own token movement; Base USDC returns `bool` and behaves standardly. |

**Test count after fixes + KeelSwap removal: 35** (33 offline + 2 Base-mainnet fork). Covers: directional settlement, taker-bind, stranger-cannot-take, clamp-to-cap, double-settle, no-default on the Aqua path (ship-floor covers the worst case; underfunded period reverts), and the two-leg mirror settlement (R<F hedger-pays-reserve) end-to-end on real Aqua.

## Known limitations / out of scope
- **Oracle staleness / liveness** — if CRE/relayer stops writing, settlement halts for that period (funds safe; not lost). The receiver's relayer fallback mitigates liveness.
- **Insurance reserve directional risk** — real but bounded per period; this is the protocol's economic design, not a bug.
- A formal external audit has **not** been performed; this is an internal review for a hackathon build.
