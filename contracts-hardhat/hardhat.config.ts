import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
  networks: {
    base: {
      type: "http",
      url: configVariable("ALCHEMY_BASE_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 8453,
    },
    mainnet: {
      type: "http",
      url: configVariable("ALCHEMY_ETH_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 1,
    },
    // Kept for future dev-testing dry runs — Arc's own docs warn that local
    // EVM simulators (Hardhat's built-in network, Foundry's anvil) can't
    // reproduce Arc-specific behavior (native-USDC gas, blocklist
    // enforcement, etc.), so testnet is still the right place to rehearse
    // anything new before it touches mainnet.
    arcTestnet: {
      type: "http",
      url: configVariable("ALCHEMY_ARC_TESTNET_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 5042002,
    },
    // Arc mainnet — live Sept 16, 2026. Chain ID, RPC confirmed directly
    // against Circle's own docs (docs.arc.io/arc/references/connect-to-arc.md).
    arc: {
      type: "http",
      url: configVariable("ALCHEMY_ARC_MAINNET_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 5042,
    },
  },
});