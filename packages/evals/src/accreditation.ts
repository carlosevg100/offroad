import {createHash} from "node:crypto";
import {z} from "zod";
import {
  canonicalProcedureSchema,
  unresolvedReferenceData,
  type CanonicalProcedure,
} from "@offroad/credit-playbook";

export const goldCasePortfolioVersion = "2026.08.25-v3";

export const goldCaseRequirementSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  title: z.string().min(1),
  archetype: z.string().min(1),
  scenarioClass: z.enum(["clean", "dirty", "eligibility_negative", "economic_negative", "multi_entity", "bilingual", "vertical_exhaustion"]),
  status: z.enum(["live", "partial", "planned"]),
  modules: z.array(z.string().regex(/^M(?:10|[0-9])$/)).min(1),
  proves: z.array(z.string().min(1)).min(1),
  caveat: z.string().min(1).optional(),
}).strict();
export type GoldCaseRequirement = z.infer<typeof goldCaseRequirementSchema>;

/**
 * Required portfolio, not a claim that every case is already gold. "Live" means a deterministic
 * fixture and assertion exist; "partial" means extraction-only or incomplete downstream truth.
 */
export const goldCasePortfolio = [
  {id: "corporate-growth-clean", title: "Expansão e capex em S.A.", archetype: "growth_expansion", scenarioClass: "clean", status: "live", modules: ["M0", "M1", "M2", "M3", "M4", "M5", "M7", "M8", "M10"], proves: ["Trilho completo com cálculo, estrutura, materiais, matching e introdução bloqueada sem autorização."]},
  {id: "corporate-growth-adversarial", title: "Expansão com sala hostil e conflito material", archetype: "growth_expansion", scenarioClass: "dirty", status: "live", modules: ["M0", "M2", "M3", "M7", "M9", "M10"], proves: ["Conflitos permanecem visíveis, texto hostil não entra na base e material sem suporte é recusado."]},
  {id: "corporate-growth-eligibility-negative", title: "Capex de limitada com rota elegível alternativa", archetype: "growth_expansion", scenarioClass: "eligibility_negative", status: "live", modules: ["M4", "M5", "M10"], proves: ["Fechar uma rota jurídica não elimina a necessidade econômica nem inventa elegibilidade."]},
  {id: "dirty-working-capital", title: "Capital de giro com informação conflitante", archetype: "working_capital", scenarioClass: "dirty", status: "live", modules: ["M0", "M2", "M3", "M4", "M9"], proves: ["A base preserva conflito e separa pedido declarado de necessidade calculada."]},
  {id: "m0-single-document", title: "Intake iniciado com um único documento útil", archetype: "growth_expansion", scenarioClass: "clean", status: "live", modules: ["M0"], proves: ["Um arquivo classificado recebe crédito apenas pela cobertura que entrega e gera um próximo lote curto, sem exigir data room completo."]},
  {id: "m0-disorganized-room", title: "Sala desorganizada sem falsa completude", archetype: "growth_expansion", scenarioClass: "dirty", status: "live", modules: ["M0", "M10"], proves: ["Volume, duplicata e arquivo não classificado não viram evidência; somente cobertura suportada reduz a lista de solicitações."]},
  {id: "m0-advisor-client-isolation", title: "Assessor com múltiplos clientes segregados", archetype: "cross_archetype", scenarioClass: "multi_entity", status: "live", modules: ["M0", "M10"], proves: ["Perímetro e autorização permanecem por case e poder de introdução qualificada não é herdado entre clientes."]},
  {id: "m0-disguised-liquidity", title: "Liquidez de curto prazo descrita como capex", archetype: "growth_expansion", scenarioClass: "dirty", status: "live", modules: ["M0", "M4", "M9", "M10"], proves: ["A hipótese vira revisão explícita, preserva a rota declarada e não gera reclassificação ou promessa automática."]},
  {id: "receivables-portfolio-exhaustion", title: "Carteira de recebíveis e capacidade de cessão", archetype: "receivables", scenarioClass: "vertical_exhaustion", status: "live", modules: ["M2", "M3", "M4", "M5", "M9"], proves: ["Vinte ou mais cenários paramétricos cobrem concentração, atraso, elegibilidade, reconciliação e recusa correta."], caveat: "Este caso testa o ativo carteira. FIDC é possível veículo ou comprador e não deve ser tratado como sinônimo da carteira ou do instrumento."},
  {id: "refinancing-maturity-wall", title: "Refinanciamento e parede de vencimentos", archetype: "refinance", scenarioClass: "clean", status: "planned", modules: ["M2", "M3", "M4", "M5", "M6", "M7"], proves: ["Alongamento, custo pró-forma, não rolagem e cronograma sem criar uma nova parede."]},
  {id: "acquisition-pro-forma", title: "Aquisição com combinado pró-forma", archetype: "acquisition", scenarioClass: "clean", status: "planned", modules: ["M1", "M2", "M3", "M4", "M5", "M7"], proves: ["Sources and uses, dívida adquirida, sinergias separadas e capacidade combinada."]},
  {id: "venture-debt-runway", title: "Venture debt com runway e sponsor", archetype: "venture_debt", scenarioClass: "clean", status: "partial", modules: ["M0", "M1", "M2", "M4", "M5", "M8"], proves: ["MRR, churn, burn, runway, equity support e rota de estrutura sem exigir EBITDA positivo."], caveat: "Nimbus possui gabarito de extração, mas ainda não possui verdade completa de estrutura, materiais e matching."},
  {id: "multi-entity-group", title: "Grupo multi-entidade e subordinação estrutural", archetype: "multi_entity", scenarioClass: "multi_entity", status: "planned", modules: ["M1", "M2", "M3", "M5", "M7", "M9"], proves: ["Consolidação, eliminações, garantidores, fluxo de caixa por entidade e dívida onde o caixa existe."]},
  {id: "dirty-room-maximum", title: "Sala suja com escala, OCR e projeção conflitante", archetype: "cross_archetype", scenarioClass: "dirty", status: "partial", modules: ["M0", "M2", "M3", "M9", "M10"], proves: ["Scans, ERP, auditado, gerencial, moeda, escala e dívida incompleta sem confiança artificial."], caveat: "Aurora escaneada cobre leitura e classificação, mas não todo o trilho institucional."},
  {id: "economically-not-supportable", title: "Operação que não para de pé", archetype: "cross_archetype", scenarioClass: "economic_negative", status: "planned", modules: ["M2", "M3", "M4", "M5", "M9", "M10"], proves: ["Declínio explicável, razões suportadas e caminho de volta, sem parecer de crédito ou promessa de funding."]},
  {id: "bilingual-economic-identity", title: "Identidade econômica PT e EN", archetype: "cross_archetype", scenarioClass: "bilingual", status: "live", modules: ["M7", "M10"], proves: ["Idioma altera somente apresentação e preserva campos, cálculos, estruturas e matches."]},
  {id: "real-estate-collateral", title: "Garantia imobiliária, laudo e LTV", archetype: "growth_expansion", scenarioClass: "clean", status: "planned", modules: ["M1", "M4", "M5", "M7", "M9"], proves: ["Titularidade, ônus, valor elegível, haircut, LTV e condição de constituição separados de fatos confirmados."]},
  {id: "agro-backed-structure", title: "Agro com lastro e riscos operacionais", archetype: "working_capital", scenarioClass: "clean", status: "planned", modules: ["M1", "M2", "M4", "M5", "M6", "M9"], proves: ["Lastro, cadeia, hedge, sazonalidade, concentração e elegibilidade sem presumir CRA ou FIDC."]},
] as const satisfies readonly GoldCaseRequirement[];

export const promotionEvidenceSchema = z.object({
  procedureId: z.string().min(1),
  procedureVersion: z.string().min(1),
  unit: z.object({passed: z.boolean(), runId: z.string().min(1)}),
  integration: z.object({passed: z.boolean(), runId: z.string().min(1)}),
  goldCases: z.array(z.object({caseId: z.string().min(1), passed: z.boolean(), reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/)})).min(1),
  adversarialCases: z.array(z.object({caseId: z.string().min(1), passed: z.boolean(), reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/)})).min(1),
  bilingualIdentityPassed: z.boolean().optional(),
  templateReviewPassed: z.boolean().optional(),
  legalReview: z.object({passed: z.boolean(), reviewer: z.string().min(1), reviewedAt: z.iso.datetime()}).optional(),
  independentReview: z.object({passed: z.boolean(), reviewer: z.string().min(1), reviewedAt: z.iso.datetime()}),
}).strict();
export type PromotionEvidence = z.infer<typeof promotionEvidenceSchema>;

export type PromotionAssessment = {
  eligible: boolean;
  procedureId: string;
  evidenceFingerprint: string;
  blockers: string[];
};

export function assessProcedurePromotion(input: {
  procedure: CanonicalProcedure;
  evidence: PromotionEvidence;
  productionProcedureIds: readonly string[];
}): PromotionAssessment {
  const procedure = canonicalProcedureSchema.parse(input.procedure);
  const evidence = promotionEvidenceSchema.parse(input.evidence);
  const blockers: string[] = [];
  if (procedure.maturity !== "candidate") blockers.push("procedure is not at candidate maturity");
  if (evidence.procedureId !== procedure.id || evidence.procedureVersion !== procedure.version) blockers.push("evidence does not match the exact procedure version");
  if (!evidence.unit.passed) blockers.push("unit gate failed");
  if (!evidence.integration.passed) blockers.push("integration gate failed");
  if (evidence.goldCases.some((result) => !result.passed)) blockers.push("one or more gold cases failed");
  if (evidence.adversarialCases.some((result) => !result.passed)) blockers.push("one or more adversarial cases failed");
  if (!evidence.independentReview.passed) blockers.push("independent review failed");
  if (procedure.templates.length > 0 && evidence.templateReviewPassed !== true) blockers.push("template review is missing or failed");
  if (procedure.knowledge.legalReviewRequired && evidence.legalReview?.passed !== true) blockers.push("required legal review is missing or failed");
  const unresolved = unresolvedReferenceData(procedure.knowledge.referenceDataKeys);
  if (unresolved.length > 0) blockers.push(`reference data unresolved: ${unresolved.map((entry) => entry.key).join(", ")}`);
  const production = new Set(input.productionProcedureIds);
  const missingDependencies = procedure.dependencies.filter((dependency) => !production.has(dependency));
  if (missingDependencies.length > 0) blockers.push(`dependencies not in production: ${missingDependencies.join(", ")}`);
  return {
    eligible: blockers.length === 0,
    procedureId: procedure.id,
    evidenceFingerprint: createHash("sha256").update(stableJson(evidence)).digest("hex"),
    blockers,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
