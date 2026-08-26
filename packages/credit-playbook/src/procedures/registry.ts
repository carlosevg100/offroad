import {createHash} from "node:crypto";

import {financialDebtTruthProcedureRegistry} from "./financial-debt-truth";
import {growthCapexProcedureRegistry} from "./growth-capex";
import {languageConductProcedureRegistry} from "./language-conduct";
import {operationProcedureRegistry} from "./operation";
import {pricingProcedureRegistry} from "./pricing";
import {structureProcedureRegistry} from "./structure";
import {materialProcedureRegistry} from "./materials";

export const institutionalProcedureRegistryHash = createHash("sha256")
  .update(JSON.stringify({
    financialDebtTruth: financialDebtTruthProcedureRegistry.registryHash,
    growthCapex: growthCapexProcedureRegistry.registryHash,
    languageConduct: languageConductProcedureRegistry.registryHash,
    operation: operationProcedureRegistry.registryHash,
    pricing: pricingProcedureRegistry.registryHash,
    structure: structureProcedureRegistry.registryHash,
    materials: materialProcedureRegistry.registryHash,
  }))
  .digest("hex");
