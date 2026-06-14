// Env config validated at boot with Zod. Fail fast and loud on misconfig.
//
// Signing separation: the API process never holds the perp agent key — that
// lives only on the execution node. So HL_AGENT_PRIVATE_KEY is NOT required
// here; it is validated separately by the execution-node entrypoint.

import { z } from "zod";

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");

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
