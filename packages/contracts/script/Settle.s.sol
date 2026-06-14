// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import {TenorFundingProgram} from "../src/swapvm/TenorFundingProgram.sol";
import {TenorSwapVMRouter} from "../src/swapvm/TenorSwapVMRouter.sol";
import {FundingIndex} from "../src/FundingIndex.sol";

/// @title Settle — the per-period keeper: the receiving party settles the current period
/// @notice Settles ONE leg of a shipped funding order for the CURRENT period. The caller (PRIVATE_KEY)
///         is the leg's bound counterparty — SwapVM sets `taker = msg.sender`, and `_fundingSettle`
///         reverts `UnauthorizedTaker` if the caller isn't the counterparty. So the **party owed this
///         period runs it**:
///           - reserve-pays-above leg (`MAKER_PAYS_ABOVE=true`, MAKER=reserve): the **hedger** runs it
///             to claim the payout when `R > F`;
///           - hedger-pays-below leg (`MAKER_PAYS_ABOVE=false`, MAKER=hedger): the **reserve** runs it
///             to collect the premium when `R < F`.
///
///         Settlement is **current-period only** (`period = block.timestamp / periodSeconds`) — run it
///         within each period's window; a missed window cannot be settled later (range settlement is
///         roadmap). The order params MUST match what was shipped, or the rebuilt orderHash won't find
///         the shipped balance.
///
///   PRIVATE_KEY=0x<taker> MAKER=0x<other party> MAKER_PAYS_ABOVE=true \
///     NOTIONAL=100000000 forge script script/Settle.s.sol:Settle --rpc-url $BASE_RPC_URL --broadcast
contract Settle is Script {
    address internal constant ROUTER = 0xba93ebc0A6a24980703423C3CE729F15eEDA099B;
    address internal constant PROGRAM = 0xd04Aa86aB1bd11834931b667f918B945f6556174;
    address internal constant POS = 0x7c055823cfe08841a1b3F73e56C86183bc859132;
    address internal constant FUNDING_INDEX = 0x545f162204A92CEbeb12AA0A4AaDF777d6905005;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 internal constant PERIOD_SECONDS = 3600; // hourly — must match the shipped order + CRE config
    uint256 internal constant RATE_ONE = 1e18;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY"); // the subscriber (the bound taker)
        address subscriber = vm.addr(pk);
        address maker = vm.envAddress("MAKER"); // the insurance reserve (order maker)
        int256 fixedRate = vm.envOr("FIXED_RATE", int256(8_333_333_333_333)); // 7.3% APR as a per-HOUR rate (1e18); periodSeconds=3600 → opcode scale is 3600/3600 = 1 (one full hour)
        uint256 cap = vm.envOr("CAP", uint256(4e16));
        uint256 notional = vm.envOr("NOTIONAL", uint256(100e6));

        // Rebuild the exact shipped subscription order (buildProgram is pure; subscriber = us).
        ISwapVM.Order memory order = TenorFundingProgram(PROGRAM).buildProgram(
            maker, FUNDING_INDEX, fixedRate, cap, notional, PERIOD_SECONDS, subscriber, USDC
        );

        uint256 period = block.timestamp / PERIOD_SECONDS;
        (int256 r, bool set) = FundingIndex(FUNDING_INDEX).getFundingIndex(period);
        require(set, "funding index not set for the current period yet");

        int256 diff = r - fixedRate;
        if (diff > int256(cap)) diff = int256(cap);
        if (diff < -int256(cap)) diff = -int256(cap);

        console2.log("period:", period);
        console2.log("realized R (1e18):", r);

        if (diff == 0) {
            console2.log("R == F: nothing to settle this period");
            return;
        }

        vm.startBroadcast(pk);
        if (diff > 0) {
            // Coverage (R > F): the reserve pays the subscriber. tokenIn = marker (0), tokenOut = USDC.
            uint256 coverage = (uint256(diff) * notional * PERIOD_SECONDS) / (RATE_ONE * 3600);
            console2.log("coverage paid to subscriber (USDC 1e6):", coverage);
            TenorSwapVMRouter(ROUTER).swap(order, POS, USDC, 0, _takerData(subscriber));
        } else {
            // Premium (R < F): pulled from the subscriber's wallet. tokenIn = USDC, amount = premium.
            // (The subscriber must have approved USDC to Aqua once at subscribe time.)
            uint256 premium = (uint256(-diff) * notional * PERIOD_SECONDS) / (RATE_ONE * 3600);
            console2.log("premium pulled from subscriber wallet (USDC 1e6):", premium);
            TenorSwapVMRouter(ROUTER).swap(order, USDC, POS, premium, _takerData(subscriber));
        }
        vm.stopBroadcast();

        console2.log("settled period for subscriber:", subscriber);
    }

    function _takerData(address taker) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: true,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: address(0),
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }
}
