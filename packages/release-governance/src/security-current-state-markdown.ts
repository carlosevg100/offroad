import {
  assertTrustedSecurityInventoryRenderDecision,
  issueTrustedSecurityEvidenceResolutionReceipt,
  type SecurityCurrentStateInventory,
  type SecurityInventoryDecision,
  type SecurityOwner,
} from "./security-current-state.ts";
import {findNonCanonicalAssuranceLanguage} from "./security-assurance-language.ts";
import {
  evaluateSecurityAssuranceStatement,
  renderSecurityAssuranceMilestone,
  renderSecurityAssuranceStatement,
} from "./security-assurance-statements.ts";
import {
  currentSecurityAssuranceMilestones,
  currentSecurityAssuranceStatements,
} from "./current-security-inventory.ts";

export function renderSecurityCurrentStateInventory(
  candidateInventory: SecurityCurrentStateInventory,
  candidateDecision: SecurityInventoryDecision,
): string {
  const {inventory, decision} = assertTrustedSecurityInventoryRenderDecision(candidateInventory, candidateDecision);
  const claimAssessmentById = new Map(decision.claimAssessments.map((claim) => [claim.claimId, claim]));
  const entityAssessmentById = new Map(decision.entityAssessments.map((entity) => [entity.entityId, entity]));
  const gapAssessmentById = new Map(decision.gapAssessments.map((gap) => [gap.gapId, gap]));
  assertNoNonCanonicalAssuranceNarrative(inventory);
  const entityAssessment = (entityId: string) => entityAssessmentById.get(entityId);
  const entityStatus = (entityId: string) => entityAssessmentById.get(entityId)?.status ?? "coverage_contract_invalid";
  const entityGapRefs = (entityId: string) => entityAssessment(entityId)?.gapRefs ?? [];
  const assuranceTexts = currentSecurityAssuranceStatements.map((statement) => {
    const assuranceDecision = evaluateSecurityAssuranceStatement({
      statement,
      evidence: [],
      resolvedEvidence: [],
    });
    return renderSecurityAssuranceStatement(statement, assuranceDecision, "pt-BR");
  });
  const milestoneTexts = currentSecurityAssuranceMilestones.map((milestone) =>
    renderSecurityAssuranceMilestone(
      milestone,
      "pt-BR",
      milestone.evidenceRef
        ? issueTrustedSecurityEvidenceResolutionReceipt(candidateInventory, candidateDecision, milestone.evidenceRef)
        : null,
    ));
  const lines: string[] = [
    "# Inventário atual de segurança da Offroad",
    "",
    `Versão: \`${inventory.inventoryVersion}\``,
    "",
    `Baseline: \`${inventory.baseline.repository}@${inventory.baseline.commit}\`, evidência até ${inventory.baseline.evidenceCutoff}, revisão até ${inventory.baseline.reviewDueAt}`,
    "",
    `Fingerprint: \`${decision.inventoryFingerprint}\``,
    "",
    `Status: baseline do repositório com verificação de evidência \`${decision.evidenceVerification}\`. Claims externos e milestones aparecem exclusivamente na seção governada abaixo.`,
    "",
    "## Como ler",
    "",
    inventory.scopeStatement,
    "",
    "`verified` significa apenas que a afirmação delimitada possui evidência referenciada e resolvida pelo gate confiável. `partial` e `unknown` preservam lacunas abertas. Integração observada em código não comprova ativação live nem termos contratuais. Uma observação de operador nunca comprova o estado efetivo de uma permissão.",
    "",
    ...inventory.limitations.map((limitation) => `- ${limitation}`),
    "",
    "## Resumo",
    "",
    "| Dimensão | Quantidade |",
    "| --- | ---: |",
    `| Ambientes | ${decision.counts.environments} |`,
    `| Sistemas | ${decision.counts.systems} |`,
    `| Data stores | ${decision.counts.dataStores} |`,
    `| Fluxos | ${decision.counts.dataFlows} |`,
    `| Identidades e service roles | ${decision.counts.identities} |`,
    `| Vendors e subprocessadores | ${decision.counts.vendors} |`,
    `| Lacunas abertas | ${decision.counts.openGaps} |`,
    `| Claims canônicos de coverage | ${decision.counts.coverageClaims} |`,
    `| Inventário estruturalmente válido | ${decision.structurallyValid ? "sim" : "não"} |`,
    `| Repositório, bytes e coverage resolvidos pelo gate confiável | ${decision.currentStateTruthVerified ? "sim" : "não"} |`,
    `| Assurance ready | ${decision.assuranceReady ? "sim" : "não"} |`,
    "",
    "## Assurance externa e milestones",
    "",
    "Claims externos são derivados de objetos tipados. O renderer só pode emitir um estado atestado após validar evidência assinada, vigente, não revogada e com o mesmo escopo contra uma trust root governada. O registro atual não contém trust root nem attestation externa.",
    "",
    ...assuranceTexts.map((statement) => `- ${statement}`),
    "",
    ...milestoneTexts.map((milestone) => `- ${milestone}`),
    "",
    "## Claims canônicos de coverage",
    "",
    "O status abaixo é derivado pelo gate a partir de evidências resolvidas e gaps obrigatórios. Claims, critérios, evidências, severidade e estado esperado dos gaps fazem parte de um catálogo canônico fora do payload editável.",
    "",
    "| Claim | Domínio | Critério | Evidências e critérios | Gaps obrigatórios | Status derivado |",
    "| --- | --- | --- | --- | --- | --- |",
    ...inventory.coverageClaims.map((claim) => row([
      claim.claimId,
      claim.domain,
      claim.criterion,
      claim.evidenceRequirements.map((requirement) => `\`${requirement.evidenceRef}\`: ${requirement.criterion}`).join("; "),
      refs(claim.requiredGaps.map((gap) => gap.gapRef)),
      claimAssessmentById.get(claim.claimId)?.status ?? "ausente",
    ])),
    "",
    "## Ambientes",
    "",
    "| ID | Ambiente | Classe | Dados de cliente | Região | Estado | Owner | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.environments.map((item) => row([
      item.environmentId, item.title, item.classification ?? "sem classificação", item.customerDataPolicy,
      item.region ?? "unknown", entityStatus(item.environmentId), ownerLabel(item.owner), refs(entityGapRefs(item.environmentId)),
    ])),
    "",
    "## Classes de dados",
    "",
    "| Classe | Regra de tratamento | Ambientes declarados para tratamento | Uso externo requer aprovação | Estado | Owner | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.dataClasses.map((item) => row([
      item.dataClassId, item.handlingRule, refs(item.declaredHandlingEnvironmentRefs), item.externalUseRequiresApproval ? "sim" : "não",
      entityStatus(item.dataClassId), ownerLabel(item.owner), refs(entityGapRefs(item.dataClassId)),
    ])),
    "",
    "## Sistemas",
    "",
    "| ID | Sistema | Tipo | Ambientes | Dados | Vendors | Estado | Owner | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.systems.map((item) => row([
      item.systemId, item.title, item.kind, refs(item.environmentRefs), refs(item.dataClassIds), refs(item.vendorRefs), entityStatus(item.systemId), ownerLabel(item.owner), refs(entityGapRefs(item.systemId)),
    ])),
    "",
    "## Data stores",
    "",
    "| ID | Store | Sistema | Dados | Retenção | Backup | Estado | Boundary | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.dataStores.map((item) => row([
      item.storeId, item.title, item.systemRef, refs(item.dataClassIds), item.retentionState, item.backupState, entityStatus(item.storeId), item.tenancyBoundary, refs(entityGapRefs(item.storeId)),
    ])),
    "",
    "## Fluxos de dados",
    "",
    "| ID | Fluxo | Origem | Destino | Dados | Direção | Boundary de autorização | Estado | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.dataFlows.map((item) => row([
      item.flowId, item.title, item.sourceRef, item.destinationRef, refs(item.dataClassIds), item.direction, item.authorizationBoundary, entityStatus(item.flowId), refs(entityGapRefs(item.flowId)),
    ])),
    "",
    "## Identidades e service roles",
    "",
    "| ID | Identidade | Tipo | Sistema | Privilégio | Autenticação | Ciclo | Estado | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.identities.map((item) => row([
      item.identityId, item.title, item.kind, item.systemRef, item.privilege, item.authentication, item.lifecycleState, entityStatus(item.identityId), refs(entityGapRefs(item.identityId)),
    ])),
    "",
    "## Vendors e subprocessadores",
    "",
    "| ID | Vendor | Papel | Ativação observada | Contrato | Retenção | Training use | Região | Estado | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.vendors.map((item) => row([
      item.vendorId, item.title, item.role, item.activationState, item.contractState, item.retentionState, item.trainingUseState, item.regionState, entityStatus(item.vendorId), refs(entityGapRefs(item.vendorId)),
    ])),
    "",
    "## Lacunas abertas",
    "",
    "| ID | Severidade | Lacuna | Owner | Controles | Próxima ação |",
    "| --- | --- | --- | --- | --- | --- |",
    ...inventory.gaps.filter((item) => gapAssessmentById.get(item.gapId)?.status === "open").map((item) => row([
      `<a id="${item.gapId.toLowerCase()}"></a>\`${item.gapId}\``, gapAssessmentById.get(item.gapId)?.severity ?? "invalid", item.title, ownerLabel(item.owner), refs(gapAssessmentById.get(item.gapId)?.controlIds ?? []), item.nextAction,
    ])),
    "",
    "## Governança e rastreabilidade por objeto",
    "",
    "| ID | Owner | Backup | Evidências | Controles |",
    "| --- | --- | --- | --- | --- |",
    ...governedEntries(inventory).map(([id, item]) => row([
      id, item.owner.ownerRole ?? "ausente", item.owner.backupOwnerRole ?? "ausente", refs(entityAssessment(id)?.evidenceRefs ?? []), refs(entityAssessment(id)?.controlIds ?? []),
    ])),
    "",
    "## Evidências da baseline",
    "",
    "| ID | Tipo | Referência | Capturada | Freshness | Descrição |",
    "| --- | --- | --- | --- | --- | --- |",
    ...inventory.evidenceIndex.map((item) => row([
      item.evidenceId, item.kind, immutableEvidenceRef(inventory, item), item.capturedAt,
      item.freshness === "immutable" ? `immutable @ ${item.immutableFingerprint}` : `válida até ${item.validThrough ?? "ausente"}`,
      `${item.description} Hash: ${item.contentFingerprint}. Authority: ${item.authorityRef}.${item.collector ? ` Collector: ${item.collector.name}@${item.collector.version} (${item.collector.principalClass}).` : ""}`,
    ])),
    "",
    "## Resultado do validador",
    "",
    decision.blockers.length === 0 ? "Nenhum blocker estrutural." : `Blockers: ${decision.blockers.map((item) => `${item.subjectRef ?? "inventory"}:${item.code}`).join(", ")}`,
    "",
    decision.warnings.length === 0 ? "Nenhum warning estrutural." : `Warnings: ${decision.warnings.map((item) => `${item.subjectRef ?? "inventory"}:${item.code}`).join(", ")}`,
    "",
    "A existência desta vista não fecha as lacunas listadas. Evidência live, contratos, owners nominais e operação ao longo do tempo precisam ser coletados em tarefas posteriores.",
    "",
  ];
  return lines.join("\n");
}

/**
 * Assurance prose lint runs only over inventory-authored narrative. Typed assurance statements and
 * milestones bypass this lint because their renderer receipts are the authentication boundary;
 * there is deliberately no caller-provided text allowlist and no subtraction from final output.
 */
function assertNoNonCanonicalAssuranceNarrative(inventory: SecurityCurrentStateInventory): void {
  const narratives = [
    inventory.scopeStatement,
    ...inventory.limitations,
    ...inventory.coverageClaims.flatMap((claim) => [
      claim.criterion,
      ...claim.evidenceRequirements.map((requirement) => requirement.criterion),
    ]),
    ...inventory.environments.flatMap((item) => [item.title, item.purpose, item.region ?? ""]),
    ...inventory.dataClasses.flatMap((item) => [item.title, item.description, item.handlingRule]),
    ...inventory.systems.flatMap((item) => [item.title, item.purpose]),
    ...inventory.dataStores.flatMap((item) => [item.title, item.tenancyBoundary]),
    ...inventory.dataFlows.flatMap((item) => [item.title, item.purpose, item.authorizationBoundary]),
    ...inventory.identities.flatMap((item) => [item.title, item.authentication]),
    ...inventory.vendors.flatMap((item) => [item.title, item.service]),
    ...inventory.gaps.flatMap((item) => [item.title, item.nextAction]),
    ...inventory.evidenceIndex.flatMap((item) => [item.description]),
  ];
  const findings = narratives.flatMap((narrative) => findNonCanonicalAssuranceLanguage(narrative));
  if (findings.length > 0) {
    throw new Error(`security inventory contains noncanonical assurance language: ${findings.map((finding) => finding.match).join(",")}`);
  }
}

type GovernedView = {
  owner: SecurityOwner;
  evidenceRefs: string[];
  controlIds: string[];
};

function governedEntries(inventory: SecurityCurrentStateInventory): Array<[string, GovernedView]> {
  return [
    ...inventory.environments.map((item): [string, GovernedView] => [item.environmentId, item]),
    ...inventory.dataClasses.map((item): [string, GovernedView] => [item.dataClassId, item]),
    ...inventory.systems.map((item): [string, GovernedView] => [item.systemId, item]),
    ...inventory.dataStores.map((item): [string, GovernedView] => [item.storeId, item]),
    ...inventory.dataFlows.map((item): [string, GovernedView] => [item.flowId, item]),
    ...inventory.identities.map((item): [string, GovernedView] => [item.identityId, item]),
    ...inventory.vendors.map((item): [string, GovernedView] => [item.vendorId, item]),
  ];
}

function immutableEvidenceRef(
  inventory: SecurityCurrentStateInventory,
  item: SecurityCurrentStateInventory["evidenceIndex"][number],
): string {
  if (["repository_file", "automated_test", "configuration", "design_reference"].includes(item.kind)) {
    return `\`${inventory.baseline.repository}@${inventory.baseline.commit}:${item.ref}\``;
  }
  return `\`${item.ref}\``;
}

function ownerLabel(owner: SecurityOwner): string {
  return `${owner.ownerRole ?? "ausente"} / backup: ${owner.backupOwnerRole ?? "ausente"} / ${owner.assignment}`;
}

function refs(values: readonly string[]): string {
  return values.length === 0 ? "nenhum" : values.map((value) => value.startsWith("SG-") ? `[\`${value}\`](#${value.toLowerCase()})` : `\`${value}\``).join(", ");
}

function row(values: Array<string | number>): string {
  return `| ${values.map((value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ")).join(" | ")} |`;
}
