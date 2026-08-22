import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, encodeFunctionData, getAddress, zeroAddress, type Address } from "viem";

// Exercises the exact mechanism behind the app's "Send" button in
// OwnerClaimPanel.tsx: calldata built the same way the frontend builds it
// (rescueERC20(token, to, amount), with `to` mapped to the claim's
// deterministic receiver) sent as a raw transaction to the stranded
// contract. Proves the on-chain effect, not just that encoding it succeeds.
const LOSS_TX = ("0x" + "cd".repeat(32)) as `0x${string}`;

describe("Owner rescue send (mock)", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  let wallets: Awaited<ReturnType<typeof viem.getWalletClients>>;
  let owner: Address, protocol: Address;
  let router: any;
  let token: any;
  let vault: any;

  before(async () => {
    wallets = await viem.getWalletClients();
    owner    = getAddress(wallets[1].account.address); // the "victim" / contract owner
    protocol = getAddress(wallets[3].account.address);
  });

  beforeEach(async () => {
    router = await viem.deployContract("SalvageRecoveryRouter", [protocol]);
    token  = await viem.deployContract("MockERC20", ["Mock USD", "MUSD"]);
    vault  = await viem.deployContract("MockStrandedVault", [owner]);
    // Simulate tokens accidentally stranded in the vault contract
    await token.write.mint([vault.address, parseEther("500")]);
  });

  async function registerClaim() {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const chainId = await publicClient.getChainId();
    const params = {
      token: token.address as Address, victim: owner, finder: zeroAddress,
      lossTxHash: LOSS_TX, deadline,
    };
    const sig = await wallets[1].signTypedData({
      account: wallets[1].account,
      domain: { name: "SalvageRecoveryRouter", version: "1", chainId, verifyingContract: router.address as Address },
      types: {
        RecoveryClaim: [
          { name: "token", type: "address" }, { name: "victim", type: "address" },
          { name: "finder", type: "address" }, { name: "lossTxHash", type: "bytes32" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "RecoveryClaim",
      message: params,
    });
    const hash = await router.write.registerClaim(
      [params.token, params.victim, params.finder, params.lossTxHash, params.deadline, sig]
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: router.address, abi: router.abi,
      eventName: "ClaimRegistered", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });
    return {
      claimId:  (logs[0].args as any).claimId as `0x${string}`,
      receiver: getAddress((logs[0].args as any).receiver as Address),
    };
  }

  it("calldata built like the Send button actually funds the receiver, and settles end-to-end", async () => {
    const { claimId, receiver } = await registerClaim();

    // Mirrors OwnerClaimPanel's mapRescueArgs for a rescueERC20(token, to,
    // amount) signature: the "token" param maps to the stranded token, the
    // "to"-style param maps to the claim's deposit receiver, "amount" maps
    // to the full balance being rescued.
    const rescueCalldata = encodeFunctionData({
      abi: vault.abi,
      functionName: "rescueERC20",
      args: [token.address, receiver, parseEther("500")],
    });

    const txHash = await wallets[1].sendTransaction({
      account: wallets[1].account,
      to: vault.address,
      data: rescueCalldata,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    assert.equal(receipt.status, "success");

    assert.equal(await token.read.balanceOf([receiver]), parseEther("500"));
    assert.equal(await token.read.balanceOf([vault.address]), 0n);

    // Full loop: the rescued funds settle exactly like any other funded claim
    await router.write.settle([claimId]);
    assert.equal(await token.read.balanceOf([owner]),    parseEther("475")); // 95%
    assert.equal(await token.read.balanceOf([protocol]), parseEther("25"));  // 5%
  });

  it("a non-owner sending the same calldata cannot rescue the funds", async () => {
    const { receiver } = await registerClaim();
    const rescueCalldata = encodeFunctionData({
      abi: vault.abi,
      functionName: "rescueERC20",
      args: [token.address, receiver, parseEther("500")],
    });

    // Locally, Hardhat's gas estimation surfaces the vault's onlyOwner
    // revert before the tx even broadcasts. On a real chain with a wallet
    // that doesn't pre-simulate, this is exactly the "broadcast but
    // reverted" case the Send button's receipt.status check exists to
    // catch — either way, the funds must stay untouched.
    await assert.rejects(
      wallets[4].sendTransaction({ account: wallets[4].account, to: vault.address, data: rescueCalldata })
    );
    assert.equal(await token.read.balanceOf([vault.address]), parseEther("500"));
  });
});
