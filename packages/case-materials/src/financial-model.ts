import {auditCompiledMaterial} from "./conduct";
import type {Material} from "./compile";

export type FinancialModelMaterialInput = {
  artifactFingerprint: string;
  periods: readonly string[];
  sheetNames: {pt: readonly string[]; en: readonly string[]};
  deskAssumptions: readonly string[];
  selectedAlternativeId: string;
  amount: string;
  termMonths: number;
  graceMonths: number;
  supportIds: readonly string[];
};

/**
 * Represents the separately compiled XLSX in the governed package.
 *
 * The workbook bytes are not embedded in the case state. They are rebuilt deterministically
 * from the same confirmed structure when downloaded. This material keeps their exact compiler
 * fingerprint, the economic inputs and the lineage that make the file reproducible.
 */
export function financialModelMaterial(input: FinancialModelMaterialInput): Material {
  const material: Material = {
    kind: "financial_model",
    title: {pt: "Modelo financeiro indicativo", en: "Indicative financial model"},
    blocks: [
      {
        type: "callout",
        title: {pt: "Base do modelo", en: "Model basis"},
        items: [
          {
            label: {pt: "Estrutura confirmada", en: "Confirmed structure"},
            value: {pt: input.selectedAlternativeId, en: input.selectedAlternativeId},
            material: true,
            claimKind: "premise",
            supportIds: [...input.supportIds],
          },
          {
            label: {pt: "Volume indicativo", en: "Indicative amount"},
            value: {pt: input.amount, en: input.amount},
            material: true,
            claimKind: "premise",
            supportIds: [...input.supportIds],
          },
          {
            label: {pt: "Prazo e carência", en: "Tenor and grace"},
            value: {
              pt: `${input.termMonths} meses, com ${input.graceMonths} meses de carência`,
              en: `${input.termMonths} months, with ${input.graceMonths} months of grace`,
            },
            material: true,
            claimKind: "premise",
            supportIds: [...input.supportIds],
          },
          {
            label: {pt: "Horizonte", en: "Horizon"},
            value: {pt: input.periods.join(" a "), en: input.periods.join(" to ")},
          },
          {
            label: {pt: "Abas", en: "Sheets"},
            value: {pt: input.sheetNames.pt.join(", "), en: input.sheetNames.en.join(", ")},
          },
          {
            label: {pt: "Premissas editáveis da Offroad", en: "Editable Offroad assumptions"},
            value: {pt: String(input.deskAssumptions.length), en: String(input.deskAssumptions.length)},
          },
        ],
      },
      {
        type: "disclaimer",
        text: {
          pt: "Modelo indicativo para análise de sensibilidade. Não constitui proposta, aprovação, compromisso de crédito ou garantia de captação. As premissas editáveis são identificadas no próprio arquivo.",
          en: "Indicative model for sensitivity analysis. It is not an offer, approval, credit commitment or funding assurance. Editable assumptions are identified in the file itself.",
        },
      },
    ],
    dependsOn: [...new Set(input.supportIds)].sort(),
    artifactFingerprint: input.artifactFingerprint,
  };
  return {...material, conductAudit: auditCompiledMaterial(material)};
}
