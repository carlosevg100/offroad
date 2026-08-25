import {describe, expect, it} from "vitest";

import {archetype} from "./archetypes";
import {assessSufficiency} from "./sufficiency";
import {buildPendingRequestLadders, replayIntake, type IntakeEvent, type IntakePolicy, type LadderAttempt} from "./intake-state";

const policy: IntakePolicy = {
  version: "2026.08.25-v1",
  maxActiveRequests: 4,
  source: {title: "Política de lotes do intake", reference: "IN-13/IN-14"},
  asOf: "2026-08-25",
  validUntil: "2026-12-31",
};

const at = (sequence: number) => `2026-08-25T12:${String(sequence).padStart(2, "0")}:00.000Z`;

const baseEvents = (): IntakeEvent[] => [
  {
    type: "capital_need_declared",
    eventId: "event-1",
    caseId: "case-1",
    sequence: 1,
    occurredAt: at(1),
    frame: {
      cnpj: "12.345.678/0001-90",
      amountBand: "BRL_30M_75M",
      useOfProceeds: "growth_expansion",
      urgency: "3_to_6_months",
      desiredTenorBand: "36_60_months",
      availableCollateral: ["receivables", "real_estate"],
      currentLenders: "Banco de relacionamento",
      declaredBy: {actorId: "company-user-1", role: "company"},
      version: 1,
    },
  },
  {
    type: "archetype_routed",
    eventId: "event-2",
    caseId: "case-1",
    sequence: 2,
    occurredAt: at(2),
    route: {
      archetypeId: "growth_expansion",
      confidence: "high",
      rationale: "Uso destinado a três novas lojas com cronograma identificado.",
      retestTriggers: ["números conciliados", "sources and uses"],
      version: 1,
    },
  },
  {
    type: "analysis_scope_recorded",
    eventId: "event-3",
    caseId: "case-1",
    sequence: 3,
    occurredAt: at(3),
    scope: {
      version: 1,
      reason: "A empresa declarante é a tomadora inicialmente considerada.",
      entities: [{
        entityId: "company-1",
        legalName: "Rede Horizonte S.A.",
        role: "borrower",
        source: "member_organization",
        status: "declared",
        evidenceReferences: [],
      }],
    },
  },
];

const unsuccessfulLadder = (): readonly LadderAttempt[] => [
  {source: "classified_room", outcome: "not_found", detail: "Sala classificada consultada por tipo e campo.", evidenceIds: []},
  {source: "declared_derivation", outcome: "not_applicable", detail: "O item não pode ser derivado de fatos já confirmados.", evidenceIds: []},
  {source: "registered_public_source", outcome: "not_permitted", detail: "Não existe fonte pública permitida que substitua o item.", evidenceIds: []},
];

const addLadders = (events: IntakeEvent[], requirementIds: readonly string[]): IntakeEvent[] => {
  const result = [...events];
  const basisRevision = result.filter((event) => event.type !== "request_ladder_recorded").length;
  for (const requirementId of requirementIds) {
    const sequence = result.length + 1;
    result.push({
      type: "request_ladder_recorded",
      eventId: `event-${sequence}`,
      caseId: "case-1",
      sequence,
      occurredAt: at(sequence),
      trace: {requirementId, attempts: unsuccessfulLadder(), basisRevision, traceVersion: 1},
    });
  }
  return result;
};

const nextEvent = <T extends Omit<IntakeEvent, "eventId" | "caseId" | "sequence" | "occurredAt">>(
  events: IntakeEvent[],
  event: T,
): IntakeEvent => {
  const sequence = events.length + 1;
  return {...event, eventId: `event-${sequence}`, caseId: "case-1", sequence, occurredAt: at(sequence)} as unknown as IntakeEvent;
};

describe("adaptive intake state", () => {
  it("replays the same event stream to the same governed state", () => {
    const events = baseEvents();
    const left = replayIntake("case-1", policy, events);
    const right = replayIntake("case-1", policy, structuredClone(events));

    expect(left).toEqual(right);
    expect(left.eventsFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(left.capitalNeedFrame?.declaredAt).toBe(at(1));
    expect(left.status).toBe("collecting");
  });

  it("accepts a day-zero capital need without inventing amount, tenor or collateral", () => {
    const state = replayIntake("case-1", policy, [
      {
        type: "capital_need_declared",
        eventId: "event-1",
        caseId: "case-1",
        sequence: 1,
        occurredAt: at(1),
        frame: {
          useOfProceeds: "growth_expansion",
          declaredBy: {actorId: "company-user-1", role: "company"},
          version: 1,
        },
      },
    ]);

    expect(state.status).toBe("routing");
    expect(state.capitalNeedFrame).toEqual(expect.objectContaining({useOfProceeds: "growth_expansion", version: 1}));
    expect(state.capitalNeedFrame).not.toHaveProperty("requestedAmount");
    expect(state.capitalNeedFrame).not.toHaveProperty("availableCollateral");
  });

  it("does not ask before the classified-room, derivation and public-source ladder is complete", () => {
    const initial = replayIntake("case-1", policy, baseEvents());
    expect(initial.activeRequestBatch).toBeNull();
    expect(initial.requestRoadmap?.awaitingLadder.length).toBeGreaterThan(4);

    const openNow = assessSufficiency("growth_expansion", []).byStage.now.map((status) => status.requirement.id);
    const withLadders = replayIntake("case-1", {...policy, maxActiveRequests: 3}, addLadders(baseEvents(), openNow));
    expect(withLadders.activeRequestBatch?.requests).toHaveLength(3);
    expect(withLadders.activeRequestBatch?.requests.every((request) => request.ladderTrace.attempts.length === 3)).toBe(true);
    expect(withLadders.activeRequestBatch?.maxItems).toBe(3);
  });

  it("fails closed when the economic perimeter has not been declared", () => {
    const withoutScope = baseEvents().slice(0, 2);
    const openNow = assessSufficiency("growth_expansion", []).byStage.now.map((status) => status.requirement.id);
    const state = replayIntake("case-1", policy, addLadders(withoutScope, openNow));

    expect(state.preparationBlocks).toContain("analysis_scope_missing");
    expect(state.activeRequestBatch).toBeNull();
    expect(buildPendingRequestLadders(state)).toEqual([]);
  });

  it("does not issue requests for an advisor case without a current authorization", () => {
    const events = baseEvents().map((event) => event.type === "capital_need_declared"
      ? {...event, frame: {...event.frame, declaredBy: {actorId: "advisor-user-1", role: "advisor" as const}}}
      : event) as IntakeEvent[];
    const openNow = assessSufficiency("growth_expansion", []).byStage.now.map((status) => status.requirement.id);
    const state = replayIntake("case-1", policy, addLadders(events, openNow));

    expect(state.preparationBlocks).toContain("advisor_authorization_missing");
    expect(state.activeRequestBatch).toBeNull();
  });

  it("stops preparation when advisor authority is revoked", () => {
    const events = baseEvents().map((event) => {
      if (event.type === "capital_need_declared") {
        return {...event, frame: {...event.frame, declaredBy: {actorId: "advisor-user-1", role: "advisor" as const}}};
      }
      if (event.type === "analysis_scope_recorded") {
        return {...event, scope: {...event.scope, entities: [{
          entityId: "advisor-client:case-1:borrower",
          legalName: "Indústria Exemplo S.A.",
          role: "borrower" as const,
          source: "advisor_declaration" as const,
          status: "declared" as const,
          evidenceReferences: [],
        }]}};
      }
      return event;
    }) as IntakeEvent[];
    events.push(nextEvent(events, {
      type: "advisor_authorization_recorded",
      authorization: {
        advisorOrganizationId: "advisor-organization-1",
        clientEntityId: "advisor-client:case-1:borrower",
        authorityKind: "engagement_letter",
        status: "revoked",
        scopes: [],
        evidenceReferences: ["document:engagement-letter-1"],
        statusReason: "The advisor recorded that its engagement ended.",
        version: 1,
      },
    }));

    const state = replayIntake("case-1", policy, events);
    expect(state.preparationBlocks).toContain("advisor_authorization_revoked");
    expect(state.activeRequestBatch).toBeNull();
    expect(buildPendingRequestLadders(state)).toEqual([]);
  });

  it("blocks a declined route but keeps review-required triage visible without blocking collection", () => {
    const reviewEvents = baseEvents();
    reviewEvents.push(nextEvent(reviewEvents, {
      type: "route_check_recorded",
      routeCheck: {
        check: "group_scope",
        outcome: "review_required",
        rationale: "Related entities remain subject to document review.",
        evidenceIds: ["event:event-3"],
        version: 1,
      },
    }));
    const reviewState = replayIntake("case-1", policy, reviewEvents);
    expect(reviewState.preparationBlocks).toEqual([]);
    expect(buildPendingRequestLadders(reviewState).length).toBeGreaterThan(0);

    reviewEvents.push(nextEvent(reviewEvents, {
      type: "route_check_recorded",
      routeCheck: {
        check: "early_triage",
        outcome: "declined",
        rationale: "The declared request is outside the current preparation scope.",
        evidenceIds: ["event:event-1"],
        version: 1,
      },
    }));
    const declined = replayIntake("case-1", policy, reviewEvents);
    expect(declined.preparationBlocks).toContain("route_declined");
    expect(buildPendingRequestLadders(declined)).toEqual([]);
  });

  it("compiles honest ladder drafts and invalidates them when evidence changes", () => {
    const initial = replayIntake("case-1", policy, baseEvents());
    const drafts = buildPendingRequestLadders(initial);
    expect(drafts.length).toBeGreaterThan(4);
    expect(drafts[0]?.attempts.map(({source, outcome}) => ({source, outcome}))).toEqual(
      unsuccessfulLadder().map(({source, outcome}) => ({source, outcome})),
    );

    const openNow = assessSufficiency("growth_expansion", []).byStage.now.map((status) => status.requirement.id);
    const withLadders = addLadders(baseEvents(), openNow);
    expect(replayIntake("case-1", policy, withLadders).activeRequestBatch?.requests).toHaveLength(4);

    withLadders.push(nextEvent(withLadders, {
      type: "document_received",
      document: {id: "new-upload", originalName: "balancete.xlsx"},
      actorId: "company-user-1",
    }));
    const changed = replayIntake("case-1", policy, withLadders);
    expect(changed.evidenceRevision).toBe(4);
    expect(changed.activeRequestBatch).toBeNull();
    expect(changed.requestRoadmap?.awaitingLadder.length).toBeGreaterThan(4);
  });

  it("recomputes the request list after a document batch and suppresses four future requests", () => {
    const openNow = assessSufficiency("growth_expansion", []).byStage.now.map((status) => status.requirement.id);
    let events = addLadders(baseEvents(), openNow);
    const before = replayIntake("case-1", policy, events);
    const active = before.activeRequestBatch!.requests;
    expect(active).toHaveLength(4);

    for (const request of active) {
      const requirement = archetype("growth_expansion").requirements.find((item) => item.id === request.requirementId)!;
      expect(requirement.satisfiedBy[0], request.requirementId).toBeDefined();
      const documentIndex = events.length + 1;
      events = [
        ...events,
        nextEvent(events, {
          type: "document_classified",
          document: {id: `upload-${documentIndex}`, kind: requirement.satisfiedBy[0]!},
          classificationVersion: 1,
        }),
      ];
    }

    const after = replayIntake("case-1", policy, events);
    const activeIds = new Set(active.map((request) => request.requirementId));
    expect((after.activeRequestBatch?.requests ?? []).every((request) => !activeIds.has(request.requirementId))).toBe(true);
    expect(after.informationCoverage?.requirements.filter((status) => activeIds.has(status.requirement.id)).every((status) => status.satisfied)).toBe(true);
    expect(after.decisionLog.filter((entry) => entry.type === "request_suppressed" && activeIds.has(entry.summary.split(" ")[1]!))).toHaveLength(4);
  });

  it("records an unavailable item once and does not keep asking for it", () => {
    const openNow = assessSufficiency("growth_expansion", []).byStage.now.map((status) => status.requirement.id);
    let events = addLadders(baseEvents(), openNow);
    const first = replayIntake("case-1", policy, events).activeRequestBatch!.requests[0]!;
    events = [
      ...events,
      nextEvent(events, {
        type: "absence_recorded",
        requirementId: first.requirementId,
        response: "unavailable",
        note: "A empresa não produz esse relatório.",
        actorId: "company-user-1",
      }),
    ];

    const state = replayIntake("case-1", policy, events);
    expect(state.activeRequestBatch?.requests.some((request) => request.requirementId === first.requirementId) ?? false).toBe(false);
    expect(state.requestRoadmap?.acknowledgedAbsence).toContain(first.requirementId);
    expect(state.informationCoverage?.acknowledgedAbsences).toContainEqual({
      requirementId: first.requirementId,
      response: "unavailable",
      note: "A empresa não produz esse relatório.",
    });
  });

  it("retracts an answer and a removed document without rewriting history", () => {
    const informationRequirement = archetype("growth_expansion").requirements.find((item) => item.source === "information")!;
    const documentRequirement = archetype("growth_expansion").requirements.find((item) => item.source !== "information" && item.source !== "notice" && item.satisfiedBy[0])!;
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "information_answered",
      requirementId: informationRequirement.id,
      answer: "A expansão adiciona três lojas em praças já atendidas.",
      response: "provided",
      actorId: "company-user-1",
    }));
    events.push(nextEvent(events, {
      type: "document_classified",
      document: {id: "upload-to-remove", kind: documentRequirement.satisfiedBy[0]!},
      classificationVersion: 1,
    }));
    events.push(nextEvent(events, {
      type: "information_cleared",
      requirementId: informationRequirement.id,
      actorId: "company-user-1",
    }));
    events.push(nextEvent(events, {
      type: "document_removed",
      documentId: "upload-to-remove",
      actorId: "company-user-1",
    }));

    const state = replayIntake("case-1", policy, events);
    expect(state.documents).toEqual([]);
    expect(state.informationCoverage?.requirements.find((entry) => entry.requirement.id === informationRequirement.id)?.answer).toBeUndefined();
    expect(state.decisionLog.map((entry) => entry.type)).toEqual(expect.arrayContaining(["requirement_cleared", "document_removed"]));
  });

  it("records and removes an uploaded document before classification", () => {
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "document_received",
      document: {
        id: "upload-unclassified",
        originalName: "balancete-julho.xlsx",
        sha256: "a".repeat(64),
        byteSize: 2048,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      actorId: "company-user-1",
    }));

    const received = replayIntake("case-1", policy, events);
    expect(received.receivedDocuments).toContainEqual(expect.objectContaining({id: "upload-unclassified"}));
    expect(received.documents).toEqual([]);

    events.push(nextEvent(events, {
      type: "document_removed",
      documentId: "upload-unclassified",
      actorId: "company-user-1",
    }));
    const removed = replayIntake("case-1", policy, events);
    expect(removed.receivedDocuments).toEqual([]);
    expect(removed.decisionLog.map((entry) => entry.type)).toEqual(expect.arrayContaining(["document_received", "document_removed"]));
  });

  it("keeps a partial information answer visible without treating it as complete", () => {
    const requirement = archetype("growth_expansion").requirements.find((item) => item.source === "information")!;
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "information_answered",
      requirementId: requirement.id,
      answer: "Temos a abertura por unidade, mas julho ainda está em fechamento.",
      response: "partial",
      note: "Julho será disponibilizado após o fechamento contábil.",
      actorId: "company-user-1",
    }));

    const status = replayIntake("case-1", policy, events).informationCoverage?.requirements.find((entry) => entry.requirement.id === requirement.id);
    expect(status).toEqual(expect.objectContaining({
      answer: "Temos a abertura por unidade, mas julho ainda está em fechamento.",
      response: "partial",
      satisfied: false,
    }));
  });

  it("uses governed derived or public evidence without converting it into a client declaration", () => {
    const requirementId = assessSufficiency("growth_expansion", []).byStage.now[0]!.requirement.id;
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "request_ladder_recorded",
      trace: {
        requirementId,
        basisRevision: 3,
        attempts: [
          {source: "classified_room", outcome: "not_found", detail: "Não encontrado na sala.", evidenceIds: []},
          {source: "declared_derivation", outcome: "found", detail: "Derivado de fatos conciliados.", evidenceIds: ["calc:capital-need:1"]},
        ],
        traceVersion: 1,
      },
    }));

    const state = replayIntake("case-1", policy, events);
    const status = state.informationCoverage?.requirements.find((entry) => entry.requirement.id === requirementId);
    expect(status?.satisfied).toBe(true);
    expect(status?.satisfiedBy).toEqual(["calc:capital-need:1"]);
    expect(status?.answer).toBeUndefined();
  });

  it("invalidates evidence discovered by a ladder when the evidence stream changes", () => {
    const requirementId = assessSufficiency("growth_expansion", []).byStage.now[0]!.requirement.id;
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "request_ladder_recorded",
      trace: {
        requirementId,
        basisRevision: 3,
        attempts: [
          {source: "classified_room", outcome: "not_found", detail: "Não encontrado na sala.", evidenceIds: []},
          {source: "declared_derivation", outcome: "found", detail: "Derivado de fatos conciliados.", evidenceIds: ["calc:capital-need:1"]},
        ],
        traceVersion: 1,
      },
    }));
    expect(
      replayIntake("case-1", policy, events).informationCoverage?.requirements.find(
        (entry) => entry.requirement.id === requirementId,
      )?.satisfied,
    ).toBe(true);

    events.push(nextEvent(events, {
      type: "document_received",
      document: {id: "new-evidence", originalName: "novo-material.pdf"},
      actorId: "company-user-1",
    }));
    const refreshed = replayIntake("case-1", policy, events);
    const refreshedStatus = refreshed.informationCoverage?.requirements.find(
      (entry) => entry.requirement.id === requirementId,
    );

    expect(refreshed.evidenceRevision).toBe(4);
    expect(refreshedStatus?.satisfied).toBe(false);
    expect(refreshed.requestRoadmap?.awaitingLadder).toContain(requirementId);
  });

  it("preserves multi-entity scope and advisor authorization as case-level facts", () => {
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "analysis_scope_recorded",
      scope: {
        version: 2,
        reason: "Holding toma a dívida; duas operadoras geram o fluxo.",
        entities: [
          {entityId: "holding", legalName: "Grupo Horizonte S.A.", role: "borrower", source: "advisor_declaration", status: "declared", evidenceReferences: []},
          {entityId: "op-1", legalName: "Horizonte Varejo Ltda.", role: "operating_company", source: "advisor_declaration", status: "declared", evidenceReferences: []},
          {entityId: "op-2", legalName: "Horizonte Logística Ltda.", role: "guarantor", source: "advisor_declaration", status: "declared", evidenceReferences: []},
        ],
      },
    }));
    events.push(nextEvent(events, {
      type: "advisor_authorization_recorded",
      authorization: {
        advisorOrganizationId: "advisor-1",
        clientEntityId: "holding",
        authorityKind: "mandate",
        status: "documented",
        scopes: ["prepare_case", "market_sounding", "qualified_introduction"],
        declarationReference: "Mandato para esta captação",
        evidenceReferences: ["authorization:case-1:v1"],
        version: 1,
      },
    }));

    const state = replayIntake("case-1", policy, events);
    expect(state.advisorAuthorization?.clientEntityId).toBe("holding");
    expect(state.analysisScope?.entities).toHaveLength(3);
    expect(state.decisionLog.map((entry) => entry.type)).toEqual(expect.arrayContaining(["advisor_authorized", "analysis_scope_changed"]));
  });

  it("keeps documentary entity mentions pending until a person confirms the perimeter", () => {
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "analysis_scope_suggestions_recorded",
      suggestions: {
        version: 1,
        items: [{
          suggestionId: "suggestion-op-1",
          entityId: "document-entity-op-1",
          legalName: "Horizonte Logística Ltda.",
          suggestedRole: "other",
          status: "pending",
          evidenceReferences: ["document:org-chart-1"],
        }],
      },
    }));

    const pending = replayIntake("case-1", policy, events);
    expect(pending.analysisScope?.entities).toHaveLength(1);
    expect(pending.analysisScopeSuggestions?.items[0]).toEqual(expect.objectContaining({status: "pending"}));

    events.push(nextEvent(events, {
      type: "analysis_scope_recorded",
      scope: {
        version: 2,
        reason: "A operadora foi confirmada a partir do organograma enviado.",
        entities: [
          {
            entityId: "company-1",
            legalName: "Rede Horizonte S.A.",
            role: "borrower",
            source: "member_organization",
            status: "declared",
            evidenceReferences: [],
          },
          {
            entityId: "document-entity-op-1",
            legalName: "Horizonte Logística Ltda.",
            role: "operating_company",
            source: "document",
            status: "confirmed",
            evidenceReferences: ["document:org-chart-1"],
          },
        ],
      },
    }));
    events.push(nextEvent(events, {
      type: "analysis_scope_suggestions_recorded",
      suggestions: {
        version: 2,
        items: [{
          suggestionId: "suggestion-op-1",
          entityId: "document-entity-op-1",
          legalName: "Horizonte Logística Ltda.",
          suggestedRole: "other",
          status: "confirmed",
          evidenceReferences: ["document:org-chart-1"],
          decisionReason: "Confirmada como operadora do grupo.",
        }],
      },
    }));

    const confirmed = replayIntake("case-1", policy, events);
    expect(confirmed.analysisScope?.entities).toHaveLength(2);
    expect(confirmed.analysisScopeSuggestions?.items[0]?.status).toBe("confirmed");
  });

  it("separates declared, documented, verified and revoked advisor authority without broadening it", () => {
    const events = baseEvents().map((event) => {
      if (event.type === "capital_need_declared") {
        return {...event, frame: {...event.frame, declaredBy: {actorId: "advisor-user-1", role: "advisor" as const}}};
      }
      if (event.type === "analysis_scope_recorded") {
        return {...event, scope: {...event.scope, entities: [{
          entityId: "advisor-client",
          legalName: "Cliente S.A.",
          role: "borrower" as const,
          source: "advisor_declaration" as const,
          status: "declared" as const,
          evidenceReferences: [],
        }]}};
      }
      return event;
    }) as IntakeEvent[];
    const authorization = (status: "declared" | "documented" | "verified" | "revoked", version: number): IntakeEvent =>
      nextEvent(events, {
        type: "advisor_authorization_recorded",
        authorization: {
          advisorOrganizationId: "advisor-org",
          clientEntityId: "advisor-client",
          authorityKind: "engagement_letter",
          status,
          scopes: status === "revoked" ? [] : ["prepare_case"],
          evidenceReferences: status === "declared" ? [] : ["document:authority-1"],
          ...(status === "verified" ? {statusReason: "Documento conferido pela operação Offroad."} : {}),
          ...(status === "revoked" ? {statusReason: "Engajamento encerrado pelo assessor."} : {}),
          version,
        },
      });

    events.push(authorization("declared", 1));
    events.push(authorization("documented", 2));
    events.push(authorization("verified", 3));
    events.push(authorization("revoked", 4));
    const state = replayIntake("case-1", policy, events);
    expect(state.advisorAuthorization).toEqual(expect.objectContaining({status: "revoked", scopes: []}));
    expect(state.preparationBlocks).toContain("advisor_authorization_revoked");
  });

  it("records disguised liquidity as a review gate instead of silently changing the archetype", () => {
    const events = baseEvents();
    events.push(nextEvent(events, {
      type: "route_check_recorded",
      routeCheck: {
        check: "disguised_liquidity",
        outcome: "review_required",
        rationale: "Déficit de curto prazo antecede o capex; a causa precisa ser reconciliada com a companhia.",
        evidenceIds: ["calc:short-term-coverage:1", "source:debt-schedule:2026-07"],
        version: 1,
      },
    }));

    const state = replayIntake("case-1", policy, events);
    expect(state.archetypeRoute?.archetypeId).toBe("growth_expansion");
    expect(state.routeChecks).toContainEqual(expect.objectContaining({check: "disguised_liquidity", outcome: "review_required"}));
  });

  it("fails closed on invalid policy or event order", () => {
    expect(() => replayIntake("case-1", {...policy, maxActiveRequests: 6}, baseEvents())).toThrow();
    expect(() => replayIntake("case-1", {...policy, validUntil: "2026-08-24"}, baseEvents())).toThrow(/expires/);
    const outOfOrder = baseEvents().map((event, index) => index === 1 ? {...event, sequence: 3} : event) as IntakeEvent[];
    expect(() => replayIntake("case-1", policy, outOfOrder)).toThrow(/sequence/);
  });
});
