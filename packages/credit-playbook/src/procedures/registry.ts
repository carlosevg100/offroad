import {createHash} from "node:crypto";

import {financialDebtTruthProcedureRegistry, financialDebtTruthProcedures} from "./financial-debt-truth";
import {growthCapexProcedureRegistry, growthCapexProcedures} from "./growth-capex";
import {languageConductProcedureRegistry, languageConductProcedures} from "./language-conduct";
import {operationProcedureRegistry, operationProcedures} from "./operation";
import {pricingProcedureRegistry, pricingProcedures} from "./pricing";
import {structureProcedureRegistry, structureProcedures} from "./structure";
import {materialProcedureRegistry, materialProcedures} from "./materials";
import {marketDistributionProcedureRegistry, marketDistributionProcedures} from "./market-distribution";
import {redFlagProcedureRegistry, redFlagProcedures} from "./red-flags";

export const institutionalProcedureRegistryHash = createHash("sha256")
  .update(JSON.stringify({
    financialDebtTruth: financialDebtTruthProcedureRegistry.registryHash,
    growthCapex: growthCapexProcedureRegistry.registryHash,
    languageConduct: languageConductProcedureRegistry.registryHash,
    operation: operationProcedureRegistry.registryHash,
    pricing: pricingProcedureRegistry.registryHash,
    structure: structureProcedureRegistry.registryHash,
    materials: materialProcedureRegistry.registryHash,
    marketDistribution: marketDistributionProcedureRegistry.registryHash,
    redFlags: redFlagProcedureRegistry.registryHash,
  }))
  .digest("hex");

export const institutionalHouseProcedureIds = [...new Set([
  ...financialDebtTruthProcedures,
  ...growthCapexProcedures,
  ...languageConductProcedures,
  ...operationProcedures,
  ...pricingProcedures,
  ...structureProcedures,
  ...materialProcedures,
  ...marketDistributionProcedures,
  ...redFlagProcedures,
].flatMap((procedure) => procedure.knowledge.houseProcedureIds))].sort();

export const institutionalHouseProcedureIdSet: ReadonlySet<string> = new Set(institutionalHouseProcedureIds);
