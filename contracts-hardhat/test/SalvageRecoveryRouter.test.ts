import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, getAddress, zeroAddress, type Address } from "viem";

const LOSS_TX = ("0x" + "ab".repeat(32)) as `0x${string}`;

describe("SalvageRecoveryRouter", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();

  let wallets: Awaited<ReturnType<typeof viem.getWalletClients>>;
  let deployer: Address, victim: Address, finder: Address, protocol: Address, rando: Address;
  let router: any;
  let token: any;

  before(async () => {
    wallets = await viem.getWalletClients();
    deployer = getAddress(wallets[0].account.address);
    victim   = getAddress(wallets[1].account.address);
    finder   = getAddress(wallets[2].account.address);
    protocol = getAddress(wallets[3].account.address);
    rando    = getAddress(wallets[4].account.address);
  });

  beforeEach(async () => {
    router = await viem.deployContract("SalvageRecoveryRouter", [protocol]);
    token  = await viem.deployContract("MockERC20", ["Mock USD", "MUSD"]);
  });

  // ── EIP-712 signature from the victim wallet (index 1)
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

  async function registerClaim(finderAddress: Address) {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const params = {
      token: token.address as Address, victim, finder: finderAddress,
      lossTxHash: LOSS_TX, deadline,
    };
    const sig = await signClaim(params);
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

  it("victim-initiated: splits 95% victim / 5% protocol", async () => {
    const { claimId, receiver } = await registerClaim(zeroAddress);
    await token.write.mint([receiver, parseEther("1000")]);

    // permissionless settle from an unrelated wallet
    await router.write.settle([claimId], { account: wallets[4].account });

    assert.equal(await token.read.balanceOf([victim]),   parseEther("950"));
    assert.equal(await token.read.balanceOf([protocol]), parseEther("50"));
  });

  it("finder-brokered: splits 90% victim / 7% finder / 3% protocol", async () => {
    const { claimId, receiver } = await registerClaim(finder);
    await token.write.mint([receiver, parseEther("1000")]);

    await router.write.settle([claimId]);

    assert.equal(await token.read.balanceOf([victim]),   parseEther("900"));
    assert.equal(await token.read.balanceOf([finder]),   parseEther("70"));
    assert.equal(await token.read.balanceOf([protocol]), parseEther("30"));
  });

  it("computes receiver deterministically before any deployment", async () => {
    const { claimId, receiver } = await registerClaim(zeroAddress);
    assert.equal(getAddress(await router.read.claimReceiver([claimId])), receiver);
    assert.equal(await publicClient.getCode({ address: receiver }), undefined);
  });

  it("settles residual funds arriving after first settlement", async () => {
    const { claimId, receiver } = await registerClaim(zeroAddress);
    await token.write.mint([receiver, parseEther("100")]);
    await router.write.settle([claimId]);

    await token.write.mint([receiver, parseEther("40")]);
    await router.write.settle([claimId]);

    assert.equal(await token.read.balanceOf([victim]), parseEther("133")); // 95 + 38
    const claim = await router.read.claims([claimId]);
    assert.equal(claim[5], parseEther("140")); // totalSettled
  });

  it("reverts settle with nothing to settle", async () => {
    const { claimId } = await registerClaim(zeroAddress);
    await assert.rejects(router.write.settle([claimId]), /nothing to settle/);
  });

  it("rejects a signature from anyone but the victim", async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const params = {
      token: token.address as Address, victim,
      finder: zeroAddress, lossTxHash: LOSS_TX, deadline,
    };
    // sign with rando (index 4) instead of victim
    const chainId = await publicClient.getChainId();
    const badSig = await wallets[4].signTypedData({
      account: wallets[4].account,
      domain: { name: "SalvageRecoveryRouter", version: "1", chainId, verifyingContract: router.address },
      types: { RecoveryClaim: [
        { name: "token", type: "address" }, { name: "victim", type: "address" },
        { name: "finder", type: "address" }, { name: "lossTxHash", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ] },
      primaryType: "RecoveryClaim",
      message: params,
    });
    await assert.rejects(
      router.write.registerClaim([params.token, params.victim, params.finder, LOSS_TX, deadline, badSig]),
      /invalid signature/
    );
  });

  it("rejects expired signatures", async () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 10);
    const params = {
      token: token.address as Address, victim,
      finder: zeroAddress, lossTxHash: LOSS_TX, deadline: past,
    };
    const sig = await signClaim(params);
    await assert.rejects(
      router.write.registerClaim([params.token, params.victim, params.finder, LOSS_TX, past, sig]),
      /signature expired/
    );
  });

  it("rejects duplicate claims", async () => {
    await registerClaim(zeroAddress);
    await assert.rejects(registerClaim(zeroAddress), /claim exists/);
  });

  it("splits correctly for fee-on-transfer tokens (balance-delta accounting)", async () => {
    const tax = await viem.deployContract("MockTaxERC20", [rando]); // rando = tax sink
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const params = {
      token: tax.address as Address, victim,
      finder: zeroAddress, lossTxHash: LOSS_TX, deadline,
    };
    const sig = await signClaim(params);
    const hash = await router.write.registerClaim(
      [params.token, params.victim, params.finder, LOSS_TX, deadline, sig]
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: router.address, abi: router.abi,
      eventName: "ClaimRegistered", fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
    });
    const receiver = getAddress((logs[0].args as any).receiver as Address);
    const claimId  = (logs[0].args as any).claimId as `0x${string}`;

    await tax.write.mint([receiver, parseEther("1000")]);
    await router.write.settle([claimId]);

    // Router receives 950 after 5% tax on the sweep; splits on RECEIVED amount:
    //   protocol = 5% of 950 = 47.5
    //   victim payout ledger = 902.5, minus 5% tax on outbound = 857.375 landing
    assert.equal(await tax.read.balanceOf([victim]),   parseEther("857.375"));
    assert.equal(await tax.read.balanceOf([protocol]), parseEther("45.125"));
  });

  it("only owner can change fee recipient; two-step ownership works", async () => {
    await assert.rejects(
      router.write.setProtocolFeeRecipient([rando], { account: wallets[4].account }),
      /not owner/
    );
    await router.write.transferOwnership([rando]);
    assert.equal(getAddress(await router.read.owner()), deployer); // not transferred yet
    await router.write.acceptOwnership({ account: wallets[4].account });
    assert.equal(getAddress(await router.read.owner()), rando);
  });
});
