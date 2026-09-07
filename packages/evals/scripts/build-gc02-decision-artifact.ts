import {createHash} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {buildGc02DecisionArtifactContract} from "../src/gc02-decision-artifact";

const referenceRoot = fileURLToPath(new URL("../../../docs/product/reference-products/gc02/", import.meta.url));
const hash = (name: string) => createHash("sha256").update(readFileSync(`${referenceRoot}${name}`)).digest("hex");
const contract = buildGc02DecisionArtifactContract(undefined, {
  workbook: hash("GC02_Camil_Modelo_Conselho_v1.xlsx"),
  presentation: hash("GC02_Camil_Estrutura_Capital_Conselho_v1.pptx"),
});
writeFileSync(`${referenceRoot}gc02-decision-artifact-contract.json`, `${JSON.stringify(contract, null, 2)}\n`);
console.log(JSON.stringify({contractFingerprint: contract.contractFingerprint, claims: contract.claims.length, views: contract.views.length}));
