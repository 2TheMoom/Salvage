import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Throwaway, worthless test tokens — used only to exercise the batch
// register/settle flow end-to-end against the real deployed Router,
// without needing an actual stuck contract with real stranded funds.
// MockERC20.mint() has no access control, so tokens can be minted directly
// into a claim's receiver address to simulate "the owner already rescued it."
export default buildModule("MockTestTokensModule", (m) => {
  const mockA = m.contract("MockERC20", ["Mock Test Token A", "MOCKA"], { id: "MockA" });
  const mockB = m.contract("MockERC20", ["Mock Test Token B", "MOCKB"], { id: "MockB" });
  const mockC = m.contract("MockERC20", ["Mock Test Token C", "MOCKC"], { id: "MockC" });

  return { mockA, mockB, mockC };
});
