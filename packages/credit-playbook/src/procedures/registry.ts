import {createHash} from "node:crypto";

import {financialDebtTruthProcedureRegistry} from "./financial-debt-truth";
import {growthCapexProcedureRegistry} from "./growth-capex";
import {languageConductProcedureRegistry} from "./language-conduct";
import {operationProcedureRegistry} from "./operation";
import {structureProcedureRegistry} from "./structure";

export const institutionalProcedureRegistryHash = createHash("sha256")
  .update(JSON.stringify({
    financialDebtTruth: financialDebtTruthProcedureRegistry.registryHash,
    growthCapex: growthCapexProcedureRegistry.registryHash,
    languageConduct: languageConductProcedureRegistry.registryHash,
    operation: operationProcedureRegistry.registryHash,
    structure: structureProcedureRegistry.registryHash,
  }))
  .digest("hex");
