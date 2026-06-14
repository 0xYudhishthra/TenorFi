// Env config validated at boot with Zod. Fail fast and loud on misconfig.
//
// Signing separation: the API process never holds the perp agent key — that
// lives only on the execution node. So HL_AGENT_PRIVATE_KEY is NOT required
// here; it is validated separately by the execution-node entrypoint.

import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");

const hexKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 0x-prefixed 32-byte private key");

const ConfigSchema = z.object({
  // HTTP
  PORT: z.coerce.number().int().positive().default(8080),
  // Hyperliquid
  HL_NETWORK: z.enum(["mainnet", "testnet"]).default("mainnet"),
  HL_MASTER_ADDRESS: hexAddress.optional(),
  // LI.FI
  LIFI_INTEGRATOR: z.string().min(1).default("keel"),
  // KeelSwap target (empty until the contract is deployed on Base)
  KEELSWAP_ADDRESS_BASE: hexAddress.optional(),
  // Persistence
  DATABASE_PATH: z.string().min(1).default("./keel.db"),

  // ─── On-chain settlement (Base mainnet) ──────────────────────────────────
  // The settlement-scheduler drives the proven forge scripts (Ship/Settle) to
  // ship + settle funding orders on-chain. When BASE_RPC_URL and
  // KEEPER_PRIVATE_KEY are BOTH present AND SETTLE_BROADCAST=true, real txs are
  // broadcast. Absent either → DRY-RUN: the exact forge command is logged, no
  // tx is sent, and the settlement is marked `simulated: true`. Safe for CI/demo.
  //
  /** Base RPC endpoint. Absent → dry-run. */
  BASE_RPC_URL: z.string().url().optional(),
  /** Reserve/keeper key that signs ship+settle. Absent → dry-run. NEVER logged. */
  KEEPER_PRIVATE_KEY: hexKey.optional(),
  /** The insurance reserve (order maker / MAKER). Defaults to the keeper's own address. */
  RESERVE_ADDRESS: hexAddress.optional(),
  /** Master broadcast switch. Must be true (AND key+rpc present) to send real txs. */
  SETTLE_BROADCAST: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment config:\n${issues}`);
  }
  return parsed.data;
}
