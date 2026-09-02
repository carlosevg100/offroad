import {createHash} from "node:crypto";
import {z} from "zod";

import type {CapitalProjectAnalysisJob, QueueClient} from "./queue";

type FinalArtifact = {id: string; artifactFingerprint: string};

const semanticTriggerSchema = z.object({
  type: z.literal("advisor_semantic_route"),
  sourceMessageId: z.uuid(),
  assistantMessageId: z.uuid(),
});

function deterministicUuid(seed: string): string {
  const bytes = Buffer.from(createHash("sha256").update(seed).digest("hex").slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function advisorSpecializedCompletion(job: CapitalProjectAnalysisJob, artifact: FinalArtifact) {
  if (!semanticTriggerSchema.safeParse(job.payload.trigger_event).success) return null;

  const content = job.payload.locale === "pt-BR"
    ? job.payload.analysis_scope === "origination_thesis"
      ? "Concluí a primeira leitura. Abaixo está minha visão integrada da companhia, da performance, do endividamento e das alternativas estratégicas que merecem ser discutidas. Revise comigo por aqui: podemos aprofundar um ângulo, corrigir o contexto ou transformar a tese escolhida em material."
      : job.payload.analysis_scope === "company_debt_view"
        ? "Concluí o diagnóstico preliminar da companhia na ótica de dívida. Separei o que as fontes públicas sustentam, os riscos e sinais observados, o que ainda não pode ser calculado e as informações necessárias para aprofundar. O diagnóstico está pronto para sua revisão."
        : "Concluí o mapa inicial de alternativas para a necessidade de capital. Comparei rotas possíveis, condições, vantagens, trade-offs e o que ainda precisa ser comprovado antes de recomendar uma estrutura. O mapa está pronto para sua revisão."
    : job.payload.analysis_scope === "origination_thesis"
      ? "I completed the first read. Below is my integrated view of the company, performance, debt profile and the strategic alternatives worth discussing. Review it with me here: we can deepen an angle, correct the context or turn the selected thesis into materials."
      : job.payload.analysis_scope === "company_debt_view"
        ? "I completed the preliminary company diagnostic through a debt lens. I separated what public sources support, the risks and signals observed, what still cannot be calculated, and the information needed to go deeper. The diagnostic is ready for your review."
        : "I completed the initial alternatives map for the capital need. I compared possible routes, conditions, advantages, trade-offs, and what still must be evidenced before recommending a structure. The map is ready for your review.";

  return {
    completionMessageId: deterministicUuid(
      `${job.job_id}:advisor-specialized-completion:${artifact.id}:${artifact.artifactFingerprint}`,
    ),
    content,
  };
}

export async function completeAdvisorSpecializedWork(input: {
  queue: QueueClient;
  job: CapitalProjectAnalysisJob;
  artifact: FinalArtifact;
  result: unknown;
}): Promise<void> {
  const completion = advisorSpecializedCompletion(input.job, input.artifact);
  if (!completion) {
    await input.queue.complete(input.job, input.result);
    return;
  }
  await input.queue.completeAdvisorSpecializedJob(input.job, {
    ...completion,
    artifactId: input.artifact.id,
    artifactFingerprint: input.artifact.artifactFingerprint,
    result: input.result,
  });
}
