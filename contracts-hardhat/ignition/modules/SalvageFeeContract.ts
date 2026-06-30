import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Founder wallet — receives 3% protocol cut
const FOUNDER_ADDRESS = "0x8a485a86393d9e218c888a24d281f2df5bc37265";

const SalvageFeeModule = buildModule("SalvageFeeModule", (m) => {
  const founder = m.getParameter("founder", FOUNDER_ADDRESS);

  const salvageFee = m.contract("SalvageFeeContract", [founder]);

  return { salvageFee };
});

export default SalvageFeeModule;