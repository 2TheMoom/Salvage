import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Protocol fee recipient — Salvage founder wallet
const PROTOCOL_FEE_RECIPIENT = "0x8a485a86393d9e218c888a24d281f2df5bc37265";

export default buildModule("SalvageRecoveryRouter", (m) => {
  const feeRecipient = m.getParameter("protocolFeeRecipient", PROTOCOL_FEE_RECIPIENT);
  const router = m.contract("SalvageRecoveryRouter", [feeRecipient]);
  return { router };
});