import type {EvidenceRegistry, EvidenceRegistryDecision} from "./evidence-registry";

export function renderEvidenceRegistry(registry: EvidenceRegistry, decision: EvidenceRegistryDecision): string {
  const lines = [
    "# Acceptance Evidence Registry",
    "",
    "> Vista gerada de `current-evidence-registry.ts`. Não editar manualmente. Esta vista não promove capabilities.",
    "",
    `Versão: \`${registry.registryVersion}\``,
    `Gerado em: ${registry.generatedAt}`,
    `Fingerprint: \`${decision.registryFingerprint}\``,
    `Modo de verificação: \`${decision.verificationMode}\``,
    `Autoridade verificadora: ${decision.verificationAuthority ? `\`${decision.verificationAuthority.principal}@${decision.verificationAuthority.version}\`` : "não aplicável"}`,
    `Claims suportados: **${decision.allClaimsSupported ? "sim" : "não"}**`,
    "",
    "## Resumo",
    "",
    `- Evidências verificáveis registradas: ${registry.evidence.length}`,
    `- Referências de design (não são evidência): ${registry.designReferences.length}`,
    `- Claims avaliados: ${registry.claims.length}`,
    `- Bloqueadores: ${decision.blockers.length}`,
    "",
    "## Claims",
    "",
    "| Claim | Objeto | Ambiente | Critérios | Resultado |",
    "|---|---|---|---|---|",
    ...registry.claims.map((claim) => {
      const result = decision.claimDecisions.find((entry) => entry.claimId === claim.claimId);
      return `| ${claim.claimId} | ${claim.subject.kind}:${claim.subject.id} | ${claim.environment} | ${claim.criteria.length} | ${result?.supported ? "suportado" : "não suportado"} |`;
    }),
    "",
    "## Evidências",
    "",
    "| ID | Tipo | Ambiente | Status | Capturada | Expira |",
    "|---|---|---|---|---|---|",
    ...registry.evidence.map((entry) => `| ${entry.evidenceId} | ${entry.type} | ${entry.environment} | ${entry.verification.status} | ${entry.capturedAt} | ${entry.expiresAt ?? "não aplicável"} |`),
    "",
    "## Referências de design",
    "",
    "Estas referências descrevem intenção. Elas nunca satisfazem um critério de aceite.",
    "",
    "| ID | Referência | Finalidade |",
    "|---|---|---|",
    ...registry.designReferences.map((entry) => `| ${entry.designReferenceId} | ${entry.ref} | ${entry.purpose} |`),
    "",
    "## Limites atuais",
    "",
    ...registry.limitations.map((entry) => `- ${entry}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
