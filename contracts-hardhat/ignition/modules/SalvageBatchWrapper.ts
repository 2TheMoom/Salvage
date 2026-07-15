import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// No default here on purpose — the router address differs per chain
// (Ethereum vs Base), and a convenient-but-wrong default is exactly the kind
// of mistake worth making impossible. Always pass --parameters explicitly;
// see ignition/parameters/*.json for the correct address per network.
export default buildModule("SalvageBatchWrapperModule", (m) => {
  const router = m.getParameter("router");
  const wrapper = m.contract("SalvageBatchWrapper", [router]);
  return { wrapper };
});
