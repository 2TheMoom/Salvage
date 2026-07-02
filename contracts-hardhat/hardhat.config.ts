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
  },
});