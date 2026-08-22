import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Replaces the MockERC20 from MockStrandedVaultTest.ts — that one's mint()
// never emitted a Transfer event, so Alchemy's balance discovery (which
// scans Transfer logs, not raw contract state) never saw the vault's
// holding, even though the on-chain balance was genuinely there. Mints into
// the same already-deployed, already-verified MockStrandedVault — no need
// to redeploy that, only the token needed the fix.
const VAULT = "0x1beA430BAcBE76aC2486D2cDA19a449A5de865e8";

export default buildModule("MockStrandedVaultTokenV2Module", (m) => {
  const token = m.contract("MockERC20", ["Mock Stranded Token", "MOCKSTRAND"]);
  m.call(token, "mint", [VAULT, 1_000n * 10n ** 18n], { id: "mint_to_vault_v2" });
  return { token };
});
