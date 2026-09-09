import {NextIntlClientProvider} from "next-intl";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import type {VisibleExecutionBrief} from "@offroad/work-plan";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";

const approvalRenderState = vi.hoisted(() => ({acceptedFingerprint: null as string | null, stateCalls: 0}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {...actual, useState: (initial: unknown) => {
    // Only the seventh card state is submittedFingerprint; errors retain their real empty strings.
    const index = approvalRenderState.stateCalls++;
    return actual.useState(index === 6 && initial === null && approvalRenderState.acceptedFingerprint ? approvalRenderState.acceptedFingerprint : initial);
  }};
});
afterEach(() => { approvalRenderState.acceptedFingerprint = null; approvalRenderState.stateCalls = 0; });

import {ExecutionBriefCard} from "./execution-brief-card";

describe("ExecutionBriefCard", () => {
  it("shows the user agreement and never leaks internal graph or authority fields", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale="pt-BR" messages={pt}><ExecutionBriefCard version={3} onRequestEdit={async () => ({ok: true})} changes={[
      {kind: "assumption_updated", label: "Prazo", from: "60 meses", to: "72 meses"},
    ]} progress={{
      briefId: "10000000-0000-4000-8000-000000000001",
      version: 3,
      workstreams: [
        {position: 0, label: "Conferir balanço, caixa e dívida", status: "completed", completed: 1, total: 1},
        {position: 1, label: "Testar serviço da dívida e downside", status: "running", completed: 2, total: 4},
        {position: 2, label: "Comparar os caminhos", status: "waiting_user", completed: 0, total: 2},
      ],
    }} brief={{
      schemaVersion: "execution-brief.v1",
      fingerprint: "a".repeat(64),
      locale: "pt-BR",
      objective: "Preparar a conversa sobre o refinanciamento da Camil",
      currentContext: [{label: "Pedido e contexto deste projeto", role: "project_context", informationClass: "private"}],
      proposedDeliverable: "Leitura prospectiva e alternativas priorizadas",
      workstreams: [
        {label: "Conferir balanço, caixa e dívida", purpose: "Resolver a base.", sources: [{label: "RI e CVM", status: "available", informationClass: "public"}], analyses: ["Conciliação"], output: "Base conciliada", dependencies: []},
        {label: "Testar serviço da dívida e downside", purpose: "Medir capacidade.", sources: [{label: "Curvas de mercado", status: "to_research", informationClass: "public"}], analyses: ["Cenários"], output: "Diagnóstico", dependencies: ["Conferir balanço, caixa e dívida"]},
        {label: "Comparar os caminhos", purpose: "Separar trade-offs.", sources: [{label: "Métodos homologados", status: "available", informationClass: "restricted"}], analyses: ["Antes e depois"], output: "Alternativas", dependencies: ["Testar serviço da dívida e downside"]},
      ],
      assumptions: [{label: "Prazo", value: "60 meses", basis: "Informado pelo usuário", editable: true}],
      checkpoints: [{label: "Escolher o caminho a aprofundar", afterWorkstreamKey: "alternatives", kind: "choice"}],
      executionMode: "start_after_display",
    }} /></NextIntlClientProvider>);

    expect(html).toContain("Plano deste trabalho");
    expect(html).toContain("a pesquisar");
    expect(html).toContain("Premissas que você pode alterar");
    expect(html).toContain("Escolher o caminho a aprofundar");
    expect(html).toContain("Concluída · 1/1");
    expect(html).toContain("Em andamento · 2/4");
    expect(html).toContain("Aguardando você · 0/2");
    expect(html).toContain("O que mudou nesta versão");
    expect(html).toContain("Ajustar este plano");
    expect(html).toContain('class="execution-brief-card__dependencies"');
    expect(html).toMatch(/<\/header><div class="execution-brief-card__dependencies">/);
    expect(html).toContain("Inclua, retire ou priorize o que muda a entrega");
    expect(html).toContain("60 meses → 72 meses");
    expect(html).not.toContain("sourceTaskIds");
    expect(html).not.toContain("executionAuthority");
    expect(html).not.toContain("TaskSpec");
  });
});

const brief: VisibleExecutionBrief = {
  schemaVersion: "execution-brief.v1", fingerprint: "a".repeat(64), locale: "pt-BR",
  objective: "Revisar liquidez", currentContext: [], proposedDeliverable: "Diagnóstico",
  workstreams: [], assumptions: [], checkpoints: [], executionMode: "start_after_display",
};

describe("execution brief persisted approval", () => {
  for (const locale of ["pt-BR", "en-US"] as const) {
    const messages = locale === "pt-BR" ? pt : en;
    for (const status of ["awaiting", "approved", "superseded", "unavailable"] as const) {
      it(`${locale}: renders ${status} without inferring approval from execution mode`, () => {
        const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale={locale} messages={messages}>
          <ExecutionBriefCard brief={{...brief, locale}} version={2}
            approval={{status, fingerprint: brief.fingerprint, version: 2}}
            onApprove={async () => ({ok: true})} />
        </NextIntlClientProvider>);
        expect(html).toContain(`data-approval-status="${status}"`);
        expect(html).toContain(messages.ExecutionBriefCard.approval[status].title);
        expect(html.includes("<button")).toBe(status === "awaiting");
        expect(html).not.toContain(messages.ExecutionBriefCard.startsAfterDisplay);
        // The exact opaque identity is machine-readable for version binding, never visible copy.
        expect(html).toContain(`data-brief-fingerprint="${brief.fingerprint}"`);
        expect(html.split(brief.fingerprint)).toHaveLength(2);
      });
    }
  }
  it("fails closed on missing state and mismatched version or fingerprint", () => {
    for (const approval of [undefined,
      {status: "approved" as const, fingerprint: brief.fingerprint, version: 1},
      {status: "awaiting" as const, fingerprint: "b".repeat(64), version: 2},
    ]) {
      const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale="pt-BR" messages={pt}>
        <ExecutionBriefCard brief={brief} version={2} approval={approval} onApprove={async () => ({ok: true})} />
      </NextIntlClientProvider>);
      expect(html).not.toContain("<button");
      expect(html).toContain(`data-approval-status="${approval ? "superseded" : "unavailable"}"`);
    }
  });
  it("disables approval while another project command is pending", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale="pt-BR" messages={pt}>
      <ExecutionBriefCard brief={brief} version={2} disabled approval={{status: "awaiting", fingerprint: brief.fingerprint, version: 2}} onApprove={async () => ({ok: true})} />
    </NextIntlClientProvider>);
    expect(html).toContain('<button disabled=""');
  });
});


it("offers manual refresh after successful submission while authoritative approval remains stale", () => {
  // Reproduce local state after onApprove returned ok, before fresh server props arrive.
  approvalRenderState.acceptedFingerprint = brief.fingerprint;
  for (const locale of ["pt-BR", "en-US"] as const) {
    const messages = locale === "pt-BR" ? pt : en;
    approvalRenderState.stateCalls = 0;
    const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale={locale} messages={messages}>
      <ExecutionBriefCard brief={{...brief, locale}} version={2}
        approval={{status: "awaiting", fingerprint: brief.fingerprint, version: 2}}
        onApprove={async () => ({ok: true})} onRefresh={() => {}} />
    </NextIntlClientProvider>);
    expect(html).toContain('data-approval-status="awaiting"');
    expect(html).toContain(messages.ExecutionBriefCard.approval.refreshing);
    expect(html).toContain(`<button type="button">${messages.ExecutionBriefCard.approval.refresh}</button>`);
    expect(html).toContain('<button disabled=""');
    expect(html).not.toContain(messages.ExecutionBriefCard.approval.approved.title);
  }
});


describe("sector planning context projection", () => {
  it.each(["pt-BR", "en-US"] as const)("%s keeps open business descriptions and review gaps within their named scopes", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale={locale} messages={messages}><ExecutionBriefCard version={2} brief={{...brief, locale, planningContext: {
      schemaVersion: "sector-planning-context.v1", mode: "planning_only", contextFingerprint: "b".repeat(64), planFingerprint: "c".repeat(64), objects: [
        {id: "synthetic-fleet", label: "Synthetic Fleet Segment", attributes: [{dimension: "business_model", label: "Business model", value: "Vehicle leasing and fleet services", status: "confirmed", sources: [{label: "Synthetic reviewed information", version: "1", anchor: "Review 1", basis: "user_review"}]}], requirements: [], gaps: [{id: "fleet-review", label: "Review fleet-specific method applicability"}]},
        {id: "synthetic-franchise", label: "Synthetic Franchise Segment", attributes: [{dimension: "business_model", label: "Business model", value: "Franchise royalties and services", status: "proposed", sources: [{label: "Synthetic source", version: "1", anchor: "Section 2", basis: "unverified"}]}], requirements: [], gaps: [{id: "franchise-review", label: "Confirm franchise evidence and perimeter"}]},
      ],
    }}} /></NextIntlClientProvider>);
    const fleetStart = html.indexOf("Synthetic Fleet Segment");
    const franchiseStart = html.indexOf("Synthetic Franchise Segment");
    expect(fleetStart).toBeGreaterThan(-1);
    expect(franchiseStart).toBeGreaterThan(fleetStart);
    const fleet = html.slice(fleetStart, franchiseStart);
    const franchise = html.slice(franchiseStart);
    expect(fleet).toContain("Vehicle leasing and fleet services");
    expect(fleet).toContain("Review fleet-specific method applicability");
    expect(fleet).toContain(messages.ExecutionBriefCard.planningContext.status.confirmed);
    expect(fleet).not.toContain("Confirm franchise evidence and perimeter");
    expect(franchise).toContain("Franchise royalties and services");
    expect(franchise).toContain("Confirm franchise evidence and perimeter");
    expect(franchise).toContain(messages.ExecutionBriefCard.planningContext.status.proposed);
    expect(franchise).not.toContain("Review fleet-specific method applicability");
    expect(html).not.toContain("data-progress");
    expect(html).not.toContain("fleet-review");
    expect(html).not.toContain("franchise-review");
  });
  it.each(["pt-BR", "en-US"] as const)("%s shows planning evidence without inventing executable progress", (locale) => {
    const messages = locale === "pt-BR" ? pt : en;
    const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale={locale} messages={messages}><ExecutionBriefCard version={2} changes={[{kind: "planning_context_changed", label: "Contexto do ativo"}]} brief={{...brief, locale, planningContext: {
      schemaVersion: "sector-planning-context.v1", mode: "planning_only", contextFingerprint: "b".repeat(64), planFingerprint: "c".repeat(64), objects: [{id: "asset-1", label: "Ativo Solar <script>", attributes: [{dimension: "revenue_model", label: "Receita", value: "Exposição ao mercado", status: "inferred", sources: [{label: "Relatório sintético", version: "2", anchor: "página 3 / receita", basis: "unverified"}]}], requirements: [{id: "internal-requirement-id", label: "Examinar exposição residual", evidenceNeeded: ["Contrato e perfil de produção"], status: "not_examined", methodStatus: "specified"}], gaps: [{id: "internal-gap", label: "Modelo de receita a confirmar"}]}],
    }}} /></NextIntlClientProvider>);
    expect(html).toContain(messages.ExecutionBriefCard.planningContext.title);
    expect(html).toContain(messages.ExecutionBriefCard.planningContext.notExamined);
    expect(html).toContain(messages.ExecutionBriefCard.planningContext.basis.unverified);
    expect(html).toContain(messages.ExecutionBriefCard.change.planning_context_changed);
    expect(html).toContain("Ativo Solar &lt;script&gt;");
    expect(html).toContain("página 3 / receita");
    expect(html).toContain("Contrato e perfil de produção");
    expect(html).toContain("Modelo de receita a confirmar");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).not.toContain("internal-requirement-id");
    expect(html).not.toContain("specified");
    expect(html).not.toContain("data-progress");
    expect(html).not.toContain("b".repeat(64));
    expect(html).not.toContain("c".repeat(64));
  });
  it("does not add a planning section to historical briefs", () => {
    const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale="pt-BR" messages={pt}><ExecutionBriefCard brief={brief} version={1} /></NextIntlClientProvider>);
    expect(html).not.toContain("execution-brief-planning-context");
  });
});

it.each(["pt-BR", "en-US"] as const)("renders scope proof as human copy, retaining trace details in %s", (locale) => {
  const basis = {scopeFingerprint: "b".repeat(64), reportingDate: "2026-08-31", primaryDocumentId: "10000000-0000-4000-8000-000000000001", headerRow: 2, selectedSourceCount: 3, documentVersion: 4, sourceSha256: "c".repeat(64), contentSha256: "d".repeat(64)};
  const html = renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale={locale} messages={locale === "pt-BR" ? pt : en}><ExecutionBriefCard version={2} brief={{...brief, locale, assumptions: [{label: "Scope", value: "Portfolio.xlsx · Tape:2 · 2026-08-31", basis: JSON.stringify(basis), editable: true}]}} /></NextIntlClientProvider>);
  expect(html).toContain(locale === "pt-BR" ? "Versão 4" : "Version 4");
  expect(html).toContain(locale === "pt-BR" ? "3 fontes selecionadas" : "3 selected sources");
  expect(html).toContain("<details><summary>");
  expect(html).toContain(basis.scopeFingerprint);
  expect(html).not.toContain("scopeFingerprint&quot;");
  expect(html).not.toContain("primaryDocumentId");
});
