import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Throwaway live test fixture for the new in-app "Send" button: a mock
// contract with a real owner-gated rescueERC20() function, holding mock
// stranded tokens. Unlike MockTestTokens (funded by permissionless mint
// straight into a claim's receiver — no real rescue call involved), this
// exercises the actual owner-gated rescue-call path the Send button fires,
// so it needs to be verified on Basescan afterward so the app's triage can
// read its real ABI, same as it would for any real contract.
export default buildModule("MockStrandedVaultTestModule", (m) => {
  const deployer = m.getAccount(0);

  const token = m.contract("MockERC20", ["Mock Stranded Token", "MOCKSTRAND"]);
  const vault = m.contract("MockStrandedVault", [deployer]);

  m.call(token, "mint", [vault, 1_000n * 10n ** 18n], { id: "mint_to_vault" });

  return { token, vault };
});
