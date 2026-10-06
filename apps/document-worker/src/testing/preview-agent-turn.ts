import {randomUUID} from "node:crypto";
import {z} from "zod";
import {ModelGatewayError} from "@offroad/model-gateway";
import {processAgentOperationBriefJob, type TechnicalPreviewPorts, type AgentOperationBriefDependencies} from "../agent-operation-brief";
import type {AgentOperationBriefJob} from "../queue";
import {governedShadowAccessBasis} from "../intent-shadow";
import {decideLiveTurn,researchReplyLine,researchUnknownCompany,understandLiveTurn} from "../live-preview";
import {routeIntegrationPreviewTurn,type PreviewStepOutput} from "../integration-preview";
import {safeGatewayFailureCode,safeModelAttemptDiagnostics,safeModelSpend} from "../model-call-log";

/** Historical router kept solely for technical proofs; never imported by production entrypoints. */
const previewArtifactsSchema = z.array(z.object({
  task_id: z.string(),
  artifact_type: z.string(),
  artifact_fingerprint: z.string(),
  content: z.record(z.string(), z.unknown()),
}));

/** The questions the latest brief left open, by id and text, so an answer can be recognised. */
function openQuestionsOf(brief: PreviewStepOutput | undefined): Array<{id: string; text: string}> {
  const questions = brief && Array.isArray((brief as Record<string, unknown>).alignment_questions) ? (brief as Record<string, unknown>).alignment_questions as Array<Record<string, unknown>> : [];
  return questions.flatMap((question) => typeof question.id === "string" && typeof question.text === "string" ? [{id: question.id, text: question.text}] : []);
}


async function technicalPreviewHandler(ports:TechnicalPreviewPorts):Promise<{status:"succeeded"|"failed"}>{
 const {job,context,dependencies,queue,gateway,log,objectiveRoutingObservation,prepareCapturedExecutionBrief,recordPreviewWorkflowSelection}=ports;

      const priorArtifacts = previewArtifactsSchema.safeParse(queue.loadIntegrationPreviewArtifacts ? await queue.loadIntegrationPreviewArtifacts(job).catch(() => []) : []);
      const priorOutputs = new Map<string, PreviewStepOutput>();
      for (const artifact of priorArtifacts.success ? priorArtifacts.data : []) {
        const output = artifact.content.output;
        if (output && typeof output === "object" && !Array.isArray(output)) priorOutputs.set(artifact.task_id, output as PreviewStepOutput);
      }
      if (job.integration_preview_mode === "live") {
        // live_intelligence_preview: canonical route + semantic-object contracts run before the
        // supplemental preview-control reader. The derivation after them is deterministic. A
        // failed contract is an abstention with a content-free reason, never a guess.
        const liveContext = {
          locale: context.locale,
          message: context.message,
          recentMessages: context.recent_messages.map(({role, content}) => ({role, content})),
          organizationId: job.organization_id,
          projectId: context.project?.id ?? null,
          entryJob: context.project?.entryJob ?? null,
          accessBasis: governedShadowAccessBasis(context.project?.accessBasis),
          authorityGrants: ["read"] as const,
          documentIds: context.documents.map((document) => document.id),

          openQuestions: [
            ...openQuestionsOf(priorOutputs.get("A01")),
            ...(context.answered_information_request ? [{
              id: context.answered_information_request.requirementKey,
              text: context.answered_information_request.question,
            }] : []),
          ],
          priorObjectKinds: [...priorOutputs.keys()],
          requestKind: context.message_metadata.kind === "execution_brief_edit"
            ? "execution_brief_edit" as const
            : context.message_metadata.kind === "information_request_response"
            ? "information_request_response" as const
            : "message" as const,
        };
        const priorCaseId = typeof context.brief.caseId === "string" ? context.brief.caseId : null;
        const priorRequest = context.brief.request && typeof context.brief.request === "object" && !Array.isArray(context.brief.request) ? context.brief.request as Record<string, unknown> : null;
        const priorAnswers = Array.isArray(context.brief.answers)
          ? (context.brief.answers as Array<Record<string, unknown>>).flatMap((answer) => typeof answer.questionId === "string" && typeof answer.answer === "string" ? [{questionId: answer.questionId, answer: answer.answer}] : [])
          : [];
        const startedAt = Date.now();
        let liveDecision: ReturnType<typeof decideLiveTurn> | null = null;
        let failureCode = "unknown";
        try {
          const understanding = await understandLiveTurn({gateway, context: liveContext});
          const objectiveRouting = objectiveRoutingObservation(context, understanding.envelope, {
            abstain: understanding.output.abstain,
            abstainReason: understanding.output.abstainReason,
          });
          await queue.recordIntentEnvelope(job, {
            envelope: understanding.envelope,
            classifier: {
              abstain: understanding.output.abstain,
              abstainReason: understanding.output.abstainReason,
              firstQuestion: understanding.output.firstQuestion,
              surface: "live_preview_router",
              turn: understanding.output.turn,
              objectiveRouting,
              routingAttempt: understanding.routingAttempt,
              semanticObjectAttempt: understanding.semanticObjectAttempt,
              previewTurnAttempt: understanding.previewTurnAttempt,
            },
            model: understanding.modelRoute,
            costUsd: understanding.costUsd,
          }).catch((error) => log("live_preview.envelope_not_recorded", {job: job.job_id, message: error instanceof Error ? error.message.slice(0, 200) : "unknown"}));
          liveDecision = decideLiveTurn({
            locale: context.locale,
            message: context.message,
            recentMessages: liveContext.recentMessages,
            understanding,
            priorCaseId,
            priorRequest: priorRequest as never,
            priorAnswers,
            openQuestions: liveContext.openQuestions,
            artifactTypes: context.artifacts.map((artifact) => artifact.type),
            runActive: context.tasks.some((task) => ["queued", "running", "started"].includes(task.status)),
            priorOutputs,
            entryJob: context.project?.entryJob ?? "origination_thesis",
            messageId: job.payload.message_id,
            planEditRequested: liveContext.requestKind === "execution_brief_edit",
            ...(context.answered_information_request ? {answeredQuestion: {
              id: context.answered_information_request.requirementKey,
              text: context.answered_information_request.question,
            }} : {}),
          });
        } catch (error) {
          failureCode = safeGatewayFailureCode(error instanceof ModelGatewayError ? error.code : "unknown");
        }
        const liveMessageId = randomUUID();
        if (!liveDecision) {
          const reply = context.locale === "en-US"
            ? `[Internal validation, live_intelligence_preview] composition=none · company=not identified · corpus=none\nThe live router was unavailable for this turn. Nothing was assumed; send the request again or name what you need.`
            : `[Validação interna, live_intelligence_preview] composição=nenhuma · companhia=não identificada · corpus=nenhum\nO roteador vivo ficou indisponível neste turno. Nada foi assumido; envie o pedido novamente ou diga o que precisa.`;
          const modelDiagnostics = safeModelAttemptDiagnostics(dependencies.modelLineage?.() ?? []);
          await queue.recordAgentResponse(job, liveMessageId, {state: "idle", reply}, undefined, undefined);
          await queue.writeStage(job, "live_preview:understand", "failed", {messageId: liveMessageId, mode: "live_intelligence_preview", code: "live_router_failed", failureCode, latencyMs: Date.now() - startedAt, modelDiagnostics});
          await queue.complete(job, {mode: "live_intelligence_preview", decision: "router_failed", composition: null, assistantMessageId: liveMessageId, failureCode, modelDiagnostics, spend: safeModelSpend(gateway.spent())});
          log("live_preview.router_failed", {job: job.job_id, code: failureCode, modelDiagnostics});
          return {status: "succeeded"};
        }
        let liveReply = liveDecision.reply;
        let researchRecord: Record<string, unknown> = {};
        if (liveDecision.kind === "abstain" && liveDecision.record.abstainReason === "company_without_corpus" && liveDecision.record.companiesMentioned[0]) {
          const research = await researchUnknownCompany({providers: dependencies.research?.providers ?? [], company: liveDecision.record.companiesMentioned[0]});
          liveReply = `${liveReply}\n${researchReplyLine(context.locale, research)}`;
          researchRecord = {research: {status: research.status, queries: research.queries, sources: research.sources.length, cacheHits: research.cacheHits, providerCalls: research.providerCalls, maxCostExposureUsd: research.maxCostExposureUsd, reason: research.reason, latencyMs: research.latencyMs}};
          log("live_preview.research", {job: job.job_id, ...researchRecord.research as Record<string, unknown>});
        }
        const executionBrief = liveDecision.activation
          ? await prepareCapturedExecutionBrief(queue,job,context,liveDecision.activation)
          : undefined;
        if (liveDecision.activation?.job === "integration_preview") {
          await recordPreviewWorkflowSelection(queue, job, context, liveDecision.activation);
        }
        await queue.recordAgentResponse(job, liveMessageId, {state: "idle", reply: liveReply}, undefined, liveDecision.activation ?? undefined, executionBrief);
        await queue.writeStage(job, "live_preview:understand", "succeeded", {messageId: liveMessageId, mode: "live_intelligence_preview", decision: liveDecision.kind, ...liveDecision.record, ...researchRecord});
        await queue.complete(job, {mode: "live_intelligence_preview", decision: liveDecision.kind, composition: liveDecision.composition, assistantMessageId: liveMessageId, spend: safeModelSpend(gateway.spent())});
        log("live_preview.turn_routed", {job: job.job_id, decision: liveDecision.kind, composition: liveDecision.composition, corpus: liveDecision.record.corpus?.caseId ?? null, abstained: liveDecision.record.abstained, modelRoute: liveDecision.record.modelRoute, costUsd: liveDecision.record.costUsd, latencyMs: liveDecision.record.latencyMs, calls: liveDecision.record.calls});
        return {status: "succeeded"};
      }
      const decision = routeIntegrationPreviewTurn({
        locale: context.locale,
        message: context.message,
        recentMessages: context.recent_messages.map(({role, content}) => ({role, content})),
        artifactTypes: context.artifacts.map((artifact) => artifact.type),
        runActive: context.tasks.some((task) => ["queued", "running", "started"].includes(task.status)),
        priorOutputs,
        entryJob: context.project?.entryJob ?? "origination_thesis",
        messageId: job.payload.message_id,
        planEditRequested: context.message_metadata.kind === "execution_brief_edit",
        ...(context.answered_information_request ? {answeredQuestion: {
          id: context.answered_information_request.requirementKey,
          text: context.answered_information_request.question,
        }} : {}),
      });
      const previewMessageId = randomUUID();
      const previewResponse = {state: "idle" as const, reply: decision.reply};
      const executionBrief = decision.activation
        ? await prepareCapturedExecutionBrief(queue,job,context,decision.activation)
        : undefined;
      if (decision.activation?.job === "integration_preview") {
        await recordPreviewWorkflowSelection(queue, job, context, decision.activation);
      }
      await queue.recordAgentResponse(job, previewMessageId, previewResponse, undefined, decision.activation ?? undefined, executionBrief);
      await queue.writeStage(job, "agent_operation_brief", "succeeded", {messageId: previewMessageId, state: "idle", mode: "integration_preview", decision: decision.kind, composition: decision.activation?.composition, modelCalls: 0});
      await queue.complete(job, {mode: "integration_preview", decision: decision.kind, composition: decision.activation?.composition ?? null, assistantMessageId: previewMessageId, spend: safeModelSpend(gateway.spent())});
      log("integration_preview.turn_routed", {job: job.job_id, decision: decision.kind, composition: decision.activation?.composition ?? null});
      return {status: "succeeded"};
    
}

export function processTechnicalPreviewAgentJob(job:AgentOperationBriefJob,dependencies:AgentOperationBriefDependencies){
 return processAgentOperationBriefJob(job,{...dependencies,technicalPreviewHandler});
}
