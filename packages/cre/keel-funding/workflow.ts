import {
	bytesToHex,
	ConsensusAggregationByFields,
	type CronPayload,
	cre,
	getNetwork,
	type HTTPSendRequester,
	median,
	prepareReportRequest,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { type Address, encodeAbiParameters, parseAbiParameters } from 'viem'
import { z } from 'zod'

export const configSchema = z.object({
	// Cron schedule for fetching + writing funding (6-field cron, seconds-precision).
	schedule: z.string(),
	// Hyperliquid info endpoint (POST). Mainnet: https://api.hyperliquid.xyz/info
	apiUrl: z.string(),
	// Perp coin to read funding for, e.g. "BTC".
	coin: z.string(),
	// Settlement period length in seconds. period = floor(scheduledTime / periodSeconds).
	periodSeconds: z.number().int().positive(),
	evm: z.object({
		// KeelFundingReceiver address (implements onReport).
		receiverAddress: z.string(),
		// CRE chain name, e.g. "ethereum-mainnet-base-1".
		chainSelectorName: z.string(),
		// false for Base mainnet.
		isTestnet: z.boolean(),
		gasLimit: z.string(),
	}),
})

type Config = z.infer<typeof configSchema>

// Result aggregated across DON nodes. `value` is the signed 1e18 per-period funding rate.
interface FundingResult {
	value: bigint
}

const SCALE = 10n ** 18n

/**
 * Deterministically convert a decimal funding string (e.g. "0.0000125" or "-0.00003")
 * into a signed 1e18 fixed-point bigint. No floats: identical input -> identical output
 * on every node, which is required for DON consensus.
 */
export const toScaled1e18 = (decimalStr: string): bigint => {
	const trimmed = decimalStr.trim()
	const negative = trimmed.startsWith('-')
	const unsigned = trimmed.replace(/^[+-]/, '')
	const [intPart = '0', fracRaw = ''] = unsigned.split('.')
	const frac = (fracRaw + '0'.repeat(18)).slice(0, 18)
	const scaled = BigInt(intPart || '0') * SCALE + BigInt(frac || '0')
	return negative ? -scaled : scaled
}

/**
 * Settlement period index for a unix timestamp (seconds). Floor division keeps the
 * value identical across nodes for a given cron fire.
 */
export const computePeriod = (timestampSeconds: bigint, periodSeconds: number): bigint =>
	timestampSeconds / BigInt(periodSeconds)

// Hyperliquid metaAndAssetCtxs response: [ { universe: [{ name }] }, [ { funding } ] ].
type MetaAndAssetCtxs = [{ universe: { name: string }[] }, { funding: string }[]]

/**
 * Runs in node mode: each DON node POSTs to Hyperliquid, finds the coin in `universe`,
 * and returns the index-aligned funding rate scaled to 1e18.
 */
const fetchFunding = (sendRequester: HTTPSendRequester, config: Config): FundingResult => {
	const body = new TextEncoder().encode(JSON.stringify({ type: 'metaAndAssetCtxs' }))

	const response = sendRequester
		.sendRequest({
			method: 'POST',
			url: config.apiUrl,
			body,
			headers: { 'Content-Type': 'application/json' },
		})
		.result()

	if (response.statusCode !== 200) {
		throw new Error(`Hyperliquid request failed with status: ${response.statusCode}`)
	}

	const responseText = Buffer.from(response.body).toString('utf-8')
	const parsed = JSON.parse(responseText) as MetaAndAssetCtxs
	const universe = parsed[0]?.universe
	const assetCtxs = parsed[1]

	if (!Array.isArray(universe) || !Array.isArray(assetCtxs)) {
		throw new Error('Unexpected Hyperliquid response shape')
	}

	const index = universe.findIndex((asset) => asset.name === config.coin)
	if (index < 0) {
		throw new Error(`Coin ${config.coin} not found in Hyperliquid universe`)
	}

	const fundingStr = assetCtxs[index]?.funding
	if (fundingStr === undefined) {
		throw new Error(`No funding for ${config.coin} at index ${index}`)
	}

	return { value: toScaled1e18(fundingStr) }
}

/**
 * Fetch funding from Hyperliquid with DON consensus (median of the per-node value).
 */
const getConsensusFunding = (runtime: Runtime<Config>): bigint => {
	const httpCapability = new cre.capabilities.HTTPClient()

	const funding = httpCapability
		.sendRequest(
			runtime,
			fetchFunding,
			ConsensusAggregationByFields<FundingResult>({ value: median }),
		)(runtime.config)
		.result()

	return funding.value
}

/**
 * Encode the report exactly as KeelFundingReceiver.onReport decodes it:
 * abi.decode(report, (uint256 period, int256 value)).
 */
export const encodeFundingReport = (period: bigint, value: bigint) =>
	encodeAbiParameters(parseAbiParameters('uint256, int256'), [period, value])

const writeFunding = (runtime: Runtime<Config>, period: bigint, value: bigint): string => {
	const { evm } = runtime.config
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: evm.chainSelectorName,
		isTestnet: evm.isTestnet,
	})

	if (!network) {
		throw new Error(`Network not found for chain selector name: ${evm.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const report = encodeFundingReport(period, value)

	const reportResponse = runtime.report(prepareReportRequest(report)).result()

	const resp = evmClient
		.writeReport(runtime, {
			receiver: evm.receiverAddress as Address,
			report: reportResponse,
			gasConfig: { gasLimit: evm.gasLimit },
		})
		.result()

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to write funding report: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = bytesToHex(resp.txHash || new Uint8Array(32))
	runtime.log(`Funding report written for period ${period} value ${value} at tx ${txHash}`)
	return txHash
}

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
	const scheduledTime = payload.scheduledExecutionTime
	if (!scheduledTime) {
		throw new Error('Scheduled execution time is required')
	}

	const period = computePeriod(scheduledTime.seconds, runtime.config.periodSeconds)
	const value = getConsensusFunding(runtime)

	runtime.log(`Hyperliquid ${runtime.config.coin} funding for period ${period}: ${value} (1e18)`)

	return writeFunding(runtime, period, value)
}

export function initWorkflow(_config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		cre.handler(
			cronTrigger.trigger({
				schedule: _config.schedule,
			}),
			onCronTrigger,
		),
	]
}
