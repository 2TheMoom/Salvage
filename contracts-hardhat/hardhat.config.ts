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
    // Phase 0 of Arc support — testnet dry run before the Sept 16 mainnet
    // launch. Arc's own docs warn that local EVM simulators (Hardhat's
    // built-in network, Foundry's anvil) can't reproduce Arc-specific
    // behavior (native-USDC gas, blocklist enforcement, etc.), so this is
    // the network everything actually needs to be exercised against.
    arcTestnet: {
      type: "http",
      url: configVariable("ALCHEMY_ARC_TESTNET_RPC"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 5042002,
    },
  },
});