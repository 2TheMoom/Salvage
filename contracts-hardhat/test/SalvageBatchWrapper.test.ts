import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, getAddress, zeroAddress, keccak256, toBytes, type Address } from "viem";

describe("SalvageBatchWrapper", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  let wallets: Awaited<ReturnType<typeof viem.getWalletClients>>;
  let deployer: Address, victim: Address, finder: Address, protocol: Address;
  let router: any;
  let wrapper: any;
  let tokens: any[];

  before(async () => {
    wallets  = await viem.getWalletClients();
    deployer = getAddress(wallets[0].account.address);
    victim   = getAddress(wallets[1].account.address);
    finder   = getAddress(wallets[2].account.address);
    protocol = getAddress(wallets[3].account.address);
  });

  beforeEach(async () => {
    router  = await viem.deployContract("SalvageRecoveryRouter", [protocol]);
    wrapper = await viem.deployContract("SalvageBatchWrapper", [router.address]);
    tokens  = [];
    for (let i = 0; i < 5; i++) {
      tokens.push(await viem.deployContract("MockERC20", [`Mock Token ${i}`, `MOCK${i}`]));
    }
  });

  function lossTxHashFor(contractAddress: Address): `0x${string}` {
    // Mirrors contractScanLossTxHash() — not under test here, just needs to
    // be a stable, distinct hash per scenario.
    return keccak256(toBytes(`salvage-contract-scan:${contractAddress}`));
  }

  async function signClaim(params: {
    token: Address; victim: Address; finder: Address;
    lossTxHash: `0x${string}`; deadline: bigint;
  }) {
    const chainId = await publicClient.getChainId();
    return wallets[1].signTypedData({
      account: wallets[1].account,
      domain: {
        name: "SalvageRecoveryRouter",
        version: "1",
        chainId,
        verifyingContract: router.address as Address,
      },
      types: {
        RecoveryClaim: [
          { name: "token",      type: "address" },
          { name: "victim",     type: "address" },
          { name: "finder",     type: "address" },
          { name: "lossTxHash", type: "bytes32" },
          { name: "deadline",   type: "uint256" },
        ],
      },
      primaryType: "RecoveryClaim",
      message: params,
    });
  }

  it("batchRegisterClaims: registers all tokens in one transaction", async () => {
    const lossTxHash = lossTxHashFor(deployer);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const tokenAddrs = tokens.map((t) => t.address as Address);

    const signatures = await Promise.all(
      tokenAddrs.map((tokenAddr) =>
        signClaim({ token: tokenAddr, victim, finder, lossTxHash, deadline })
      )
    );

    const hash = await wrapper.write.batchRegisterClaims(
      [tokenAddrs, victim, finder, lossTxHash, deadline, signatures]
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const logs = await publicClient.getContractEvents({
      address: router.address, abi: router.abi,
      eventName: "ClaimRegistered", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });
    assert.equal(logs.length, tokenAddrs.length);

    const batchLogs = await publicClient.getContractEvents({
      address: wrapper.address, abi: wrapper.abi,
      eventName: "BatchRegistered", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });
    assert.equal((batchLogs[0].args as any).count, BigInt(tokenAddrs.length));
    assert.equal((batchLogs[0].args as any).succeeded, BigInt(tokenAddrs.length));
  });

  it("batchRegisterClaims: one bad signature doesn't revert the rest of the batch", async () => {
    const lossTxHash = lossTxHashFor(deployer);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const tokenAddrs = tokens.map((t) => t.address as Address);

    const signatures = await Promise.all(
      tokenAddrs.map((tokenAddr, i) => {
        if (i === 2) {
          // Wrong signer entirely — router's ecrecover check will reject it.
          return wallets[4].signTypedData({
            account: wallets[4].account,
            domain: { name: "SalvageRecoveryRouter", version: "1", chainId: 31337, verifyingContract: router.address as Address },
            types: { RecoveryClaim: [
              { name: "token", type: "address" }, { name: "victim", type: "address" },
              { name: "finder", type: "address" }, { name: "lossTxHash", type: "bytes32" },
              { name: "deadline", type: "uint256" },
            ] },
            primaryType: "RecoveryClaim",
            message: { token: tokenAddr, victim, finder, lossTxHash, deadline },
          });
        }
        return signClaim({ token: tokenAddr, victim, finder, lossTxHash, deadline });
      })
    );

    const hash = await wrapper.write.batchRegisterClaims(
      [tokenAddrs, victim, finder, lossTxHash, deadline, signatures]
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success"); // whole batch tx succeeds even though token 2 fails

    const batchLogs = await publicClient.getContractEvents({
      address: wrapper.address, abi: wrapper.abi,
      eventName: "BatchRegistered", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });
    assert.equal((batchLogs[0].args as any).count, 5n);
    assert.equal((batchLogs[0].args as any).succeeded, 4n); // 4 of 5, not all-or-nothing

    const registeredLogs = await publicClient.getContractEvents({
      address: router.address, abi: router.abi,
      eventName: "ClaimRegistered", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });
    assert.equal(registeredLogs.length, 4);
  });

  it("batchSettle: settles all funded claims in one transaction, splits correctly", async () => {
    const lossTxHash = lossTxHashFor(deployer);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const tokenAddrs = tokens.map((t) => t.address as Address);

    const signatures = await Promise.all(
      tokenAddrs.map((tokenAddr) => signClaim({ token: tokenAddr, victim, finder: zeroAddress, lossTxHash, deadline }))
    );
    const regHash = await wrapper.write.batchRegisterClaims(
      [tokenAddrs, victim, zeroAddress, lossTxHash, deadline, signatures]
    );
    const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regHash });
    const registeredLogs = await publicClient.getContractEvents({
      address: router.address, abi: router.abi,
      eventName: "ClaimRegistered", fromBlock: regReceipt.blockNumber, toBlock: regReceipt.blockNumber,
    });
    const claimIds = registeredLogs.map((l) => (l.args as any).claimId as `0x${string}`);
    const receivers = registeredLogs.map((l) => (l.args as any).receiver as Address);

    // Fund every receiver except the last one — that claim stays unsettleable.
    for (let i = 0; i < tokens.length - 1; i++) {
      await tokens[i].write.mint([receivers[i], parseEther("100")]);
    }

    const settleHash = await wrapper.write.batchSettle([claimIds]);
    const settleReceipt = await publicClient.waitForTransactionReceipt({ hash: settleHash });

    const batchLogs = await publicClient.getContractEvents({
      address: wrapper.address, abi: wrapper.abi,
      eventName: "BatchSettled", fromBlock: settleReceipt.blockNumber, toBlock: settleReceipt.blockNumber,
    });
    assert.equal((batchLogs[0].args as any).count, BigInt(tokens.length));
    assert.equal((batchLogs[0].args as any).succeeded, BigInt(tokens.length - 1)); // last one unfunded, skipped

    for (let i = 0; i < tokens.length - 1; i++) {
      assert.equal(await tokens[i].read.balanceOf([victim]), parseEther("95")); // victim-initiated: 95%
    }
  });

  it("reverts on an empty batch", async () => {
    await assert.rejects(wrapper.write.batchSettle([[]]));
  });

  it("reverts when batch exceeds MAX_BATCH_SIZE", async () => {
    const max = Number(await wrapper.read.MAX_BATCH_SIZE());
    const tooMany = Array.from({ length: max + 1 }, () => ("0x" + "11".repeat(32)) as `0x${string}`);
    await assert.rejects(wrapper.write.batchSettle([tooMany]));
  });

  it("reverts when tokens/signatures length mismatch", async () => {
    const lossTxHash = lossTxHashFor(deployer);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const tokenAddrs = tokens.map((t) => t.address as Address);
    const oneSignature = [await signClaim({ token: tokenAddrs[0], victim, finder, lossTxHash, deadline })];

    await assert.rejects(
      wrapper.write.batchRegisterClaims([tokenAddrs, victim, finder, lossTxHash, deadline, oneSignature])
    );
  });
});
