import type {SecurityCurrentStateInventory, SecurityInventoryDecision, SecurityOwner} from "./security-current-state";

export function renderSecurityCurrentStateInventory(
  inventory: SecurityCurrentStateInventory,
  decision: SecurityInventoryDecision,
): string {
  const lines: string[] = [
    "# Inventário atual de segurança da Offroad",
    "",
    `Versão: \`${inventory.inventoryVersion}\``,
    "",
    `Baseline: \`${inventory.baseline.repository}@${inventory.baseline.commit}\`, evidência até ${inventory.baseline.evidenceCutoff}, revisão até ${inventory.baseline.reviewDueAt}`,
    "",
    `Fingerprint: \`${decision.inventoryFingerprint}\``,
    "",
    `Status: baseline do repositório com verificação de evidência \`${decision.evidenceVerification}\`. Não é certificação, exame independente, pentest ou prova de operação contínua.`,
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
    `| Inventário estruturalmente válido | ${decision.structurallyValid ? "sim" : "não"} |`,
    `| Evidência resolvida por bytes confiáveis | ${decision.currentStateTruthVerified ? "sim" : "não"} |`,
    `| Assurance ready | ${decision.assuranceReady ? "sim" : "não"} |`,
    "",
    "## Ambientes",
    "",
    "| ID | Ambiente | Classe | Dados de cliente | Região | Estado | Owner | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.environments.map((item) => row([
      item.environmentId, item.title, item.classification ?? "sem classificação", item.customerDataPolicy,
      item.region ?? "unknown", item.status, ownerLabel(item.owner), refs(item.gapRefs),
    ])),
    "",
    "## Classes de dados",
    "",
    "| Classe | Regra de tratamento | Ambientes declarados para tratamento | Uso externo requer aprovação | Estado | Owner | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.dataClasses.map((item) => row([
      item.dataClassId, item.handlingRule, refs(item.declaredHandlingEnvironmentRefs), item.externalUseRequiresApproval ? "sim" : "não",
      item.status, ownerLabel(item.owner), refs(item.gapRefs),
    ])),
    "",
    "## Sistemas",
    "",
    "| ID | Sistema | Tipo | Ambientes | Dados | Vendors | Estado | Owner | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.systems.map((item) => row([
      item.systemId, item.title, item.kind, refs(item.environmentRefs), refs(item.dataClassIds), refs(item.vendorRefs), item.status, ownerLabel(item.owner), refs(item.gapRefs),
    ])),
    "",
    "## Data stores",
    "",
    "| ID | Store | Sistema | Dados | Retenção | Backup | Estado | Boundary | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.dataStores.map((item) => row([
      item.storeId, item.title, item.systemRef, refs(item.dataClassIds), item.retentionState, item.backupState, item.status, item.tenancyBoundary, refs(item.gapRefs),
    ])),
    "",
    "## Fluxos de dados",
    "",
    "| ID | Fluxo | Origem | Destino | Dados | Direção | Boundary de autorização | Estado | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.dataFlows.map((item) => row([
      item.flowId, item.title, item.sourceRef, item.destinationRef, refs(item.dataClassIds), item.direction, item.authorizationBoundary, item.status, refs(item.gapRefs),
    ])),
    "",
    "## Identidades e service roles",
    "",
    "| ID | Identidade | Tipo | Sistema | Privilégio | Autenticação | Ciclo | Estado | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.identities.map((item) => row([
      item.identityId, item.title, item.kind, item.systemRef, item.privilege, item.authentication, item.lifecycleState, item.status, refs(item.gapRefs),
    ])),
    "",
    "## Vendors e subprocessadores",
    "",
    "| ID | Vendor | Papel | Ativação observada | Contrato | Retenção | Training use | Região | Estado | Lacunas |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.vendors.map((item) => row([
      item.vendorId, item.title, item.role, item.activationState, item.contractState, item.retentionState, item.trainingUseState, item.regionState, item.status, refs(item.gapRefs),
    ])),
    "",
    "## Lacunas abertas",
    "",
    "| ID | Severidade | Lacuna | Owner | Controles | Próxima ação |",
    "| --- | --- | --- | --- | --- | --- |",
    ...inventory.gaps.filter((item) => item.status === "open").map((item) => row([
      `<a id="${item.gapId.toLowerCase()}"></a>\`${item.gapId}\``, item.severity, item.title, ownerLabel(item.owner), refs(item.controlIds), item.nextAction,
    ])),
    "",
    "## Governança e rastreabilidade por objeto",
    "",
    "| ID | Owner | Backup | Evidências | Controles |",
    "| --- | --- | --- | --- | --- |",
    ...governedEntries(inventory).map(([id, item]) => row([
      id, item.owner.ownerRole ?? "ausente", item.owner.backupOwnerRole ?? "ausente", refs(item.evidenceRefs), refs(item.controlIds),
    ])),
    "",
    "## Evidências da baseline",
    "",
    "| ID | Tipo | Referência | Capturada | Freshness | Descrição |",
    "| --- | --- | --- | --- | --- | --- |",
    ...inventory.evidenceIndex.map((item) => row([
      item.evidenceId, item.kind, immutableEvidenceRef(inventory, item), item.capturedAt,
      item.freshness === "immutable" ? `immutable @ ${item.immutableFingerprint}` : `válida até ${item.validThrough ?? "ausente"}`,
      `${item.description}${item.contentFingerprint ? ` Hash: ${item.contentFingerprint}.` : ""}${item.collector ? ` Collector: ${item.collector.name}@${item.collector.version} (${item.collector.principalClass}).` : ""}`,
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
