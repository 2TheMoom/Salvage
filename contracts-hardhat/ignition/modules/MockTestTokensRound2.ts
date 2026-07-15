import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Round 2 of throwaway test tokens — the first batch (MockA/B/C) already has
// registered/settled claims against them from the earlier UI-orchestrated
// batch test, so a fresh set is needed to test the new wrapper-contract flow
// without hitting "claim exists" on a reused (token, victim, finder,
// lossTxHash) tuple.
export default buildModule("MockTestTokensRound2Module", (m) => {
  const mockD = m.contract("MockERC20", ["Mock Test Token D", "MOCKD"], { id: "MockD" });
  const mockE = m.contract("MockERC20", ["Mock Test Token E", "MOCKE"], { id: "MockE" });
  const mockF = m.contract("MockERC20", ["Mock Test Token F", "MOCKF"], { id: "MockF" });
  const mockG = m.contract("MockERC20", ["Mock Test Token G", "MOCKG"], { id: "MockG" });
  const mockH = m.contract("MockERC20", ["Mock Test Token H", "MOCKH"], { id: "MockH" });

  return { mockD, mockE, mockF, mockG, mockH };
});
