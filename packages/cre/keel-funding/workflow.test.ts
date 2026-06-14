import { describe, expect } from 'bun:test'
import { newTestRuntime, test } from '@chainlink/cre-sdk/test'
import { decodeAbiParameters, parseAbiParameters } from 'viem'
import {
	computePeriod,
	encodeFundingReport,
	initWorkflow,
	onCronTrigger,
	toScaled1e18,
} from './workflow'

describe('toScaled1e18', () => {
	test('scales a small positive funding rate', () => {
		expect(toScaled1e18('0.0000125')).toBe(12_500_000_000_000n)
	})

	test('scales a negative funding rate', () => {
		expect(toScaled1e18('-0.00003')).toBe(-30_000_000_000_000n)
	})

	test('handles whole numbers and zero', () => {
		expect(toScaled1e18('0')).toBe(0n)
		expect(toScaled1e18('1')).toBe(1_000_000_000_000_000_000n)
	})

	test('truncates beyond 18 fractional digits without floats', () => {
		expect(toScaled1e18('0.1234567890123456789')).toBe(123_456_789_012_345_678n)
	})
})

describe('computePeriod', () => {
	test('floors timestamp by period length', () => {
		expect(computePeriod(7199n, 3600)).toBe(1n)
		expect(computePeriod(7200n, 3600)).toBe(2n)
	})
})

describe('encodeFundingReport', () => {
	test('round-trips (period, value) as (uint256, int256)', () => {
		const period = 12345n
		const value = -42n
		const encoded = encodeFundingReport(period, value)
		const [decodedPeriod, decodedValue] = decodeAbiParameters(
			parseAbiParameters('uint256, int256'),
			encoded,
		)
		expect(decodedPeriod).toBe(period)
		expect(decodedValue).toBe(value)
	})
})

describe('onCronTrigger', () => {
	test('throws when scheduledExecutionTime is missing', () => {
		const runtime = newTestRuntime()
		expect(() => onCronTrigger(runtime as any, {} as any)).toThrow(
			'Scheduled execution time is required',
		)
	})
})

describe('initWorkflow', () => {
	test('subscribes onCronTrigger to the cron schedule', () => {
		const config = {
			schedule: '0 */1 * * * *',
			apiUrl: 'https://api.hyperliquid.xyz/info',
			coin: 'BTC',
			periodSeconds: 3600,
			evm: {
				receiverAddress: '0x0000000000000000000000000000000000000001',
				chainSelectorName: 'ethereum-mainnet-base-1',
				isTestnet: false,
				gasLimit: '500000',
			},
		}
		const handlers = initWorkflow(config)

		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onCronTrigger)
		const cronTrigger = handlers[0].trigger as { config?: { schedule?: string } }
		expect(cronTrigger.config?.schedule).toBe(config.schedule)
	})
})
