import {writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {currentSecurityInventory} from "../src/current-security-inventory.ts";
import {evaluateSecurityCurrentStateInventoryTrusted} from "../src/security-current-state.ts";
import {renderSecurityCurrentStateInventory} from "../src/security-current-state-markdown.ts";
import {masterTrustControlCatalogue} from "../src/trust-control-catalogue.ts";

const decision = await evaluateSecurityCurrentStateInventoryTrusted(
  currentSecurityInventory,
  masterTrustControlCatalogue,
);
if (!decision.structurallyValid) {
  throw new Error(`security current-state inventory is invalid: ${JSON.stringify(decision.blockers)}`);
}
const outputPath = fileURLToPath(new URL("../../../docs/security/CURRENT_STATE_INVENTORY.md", import.meta.url));
await writeFile(outputPath, renderSecurityCurrentStateInventory(currentSecurityInventory, decision), "utf8");
