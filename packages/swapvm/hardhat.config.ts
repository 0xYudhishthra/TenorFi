import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-dependency-compiler";
import * as dotenv from "dotenv";
dotenv.config();

// Mirrors swap-vm-template. `dependencyCompiler` pulls Aqua + the Aqua SwapVM router
// out of node_modules so tests can deploy real instances on a local/forked network.
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 1_000_000 },
      viaIR: true,
      evmVersion: "cancun", // SwapVM uses transient storage (EIP-1153)
    },
  },
  dependencyCompiler: {
    paths: [
      "@1inch/aqua/src/Aqua.sol",
    ],
  },
  networks: {
    // Demo target. Fill RPC in .env; local forks are acceptable for the bounty.
    hyperevmTestnet: {
      url: process.env.HYPEREVM_RPC_URL ?? "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
