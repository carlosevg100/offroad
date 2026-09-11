import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {diversifiedReceivablesCase, underwriteReceivablesPool} from "@offroad/receivables-analysis";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {receivablesReleasedResultSchema} from "@/lib/receivables/released-result";
import {ReceivablesCurrentResult} from "./receivables-current-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) => {
    const catalog = ((locale === "en-US" ? en : pt) as Catalog)[namespace] as Catalog;
    const t = (key: string, values?: Record<string, string>) => {
      const raw = resolve(catalog, key);
      if (typeof raw !== "string") return key;
      return values ? raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) : raw;
    };
    t.has = (key: string) => typeof resolve(catalog, key) === "string";
    return t;
  },
}));

const content = underwriteReceivablesPool({currency: "BRL", case: diversifiedReceivablesCase()});
const hash = (character: string) => character.repeat(64);
const currentRelease = receivablesReleasedResultSchema.parse({
  schemaVersion: "receivables-released-result.v1",
  state: "current",
  supersededReason: null,
  previous: null,
  result: {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-09-10T18:00:00Z",
    taskId: "R01",
    executorKey: "@offroad/receivables-analysis#underwriteReceivablesPool",
    executorVersion: "2026.09.06-v1",
    methodMaturity: "production",
    evidenceScope: {id: "22222222-2222-4222-8222-222222222222", fingerprint: hash("8")},
    sourceDatasetHash: hash("a"),
    inputFingerprint: content.trace.input_fingerprint,
    outputFingerprint: content.trace.output_fingerprint,
    release: {
      organizationId: "33333333-3333-4333-8333-333333333333",
      procedure: {id: "underwrite-receivables-pool", version: "2026.09.06-v1", maturity: "production"},
      methodMaturity: "production",
      allowedUses: ["internal_validation", "customer_work"],
      maximumEffect: "none",
      confirmedScope: {id: "22222222-2222-4222-8222-222222222222", fingerprint: hash("8")},
      sourceDatasetHash: hash("a"),
    },
    artifact: {
      artifactType: "receivables_pool_underwriting",
      schemaVersion: "method.underwrite-receivables-pool.v1",
      status: "released",
      inputFingerprint: content.trace.input_fingerprint,
      outputFingerprint: content.trace.output_fingerprint,
      content,
      evidenceRefs: [{section: "cedentAndServicing", sourceClass: "provided_document", sourceId: "doc-1", anchor: "page:1"}],
    },
    qualityResults: [{id: "trace_output_fingerprint_present", status: "passed", detail: "ok"}],
  },
});

const compactReport = {receivablesVertical: {
  pipeline: {phaseOne: {staticMetrics: {portfolio: {titleCount: {value: "60"}, totalOpenValue: {value: "6000000"}}}}},
  methodReadiness: {state: "ready", gaps: []},
  methodExecution: {status: "succeeded", mode: "internal_shadow", externalEffectAllowed: false},
}};

describe("released receivables analysis on the project page", () => {
  it.each(["pt-BR", "en-US"] as const)("shows the calculation, its conventions and its limits in %s", async (locale) => {
    const html = renderToStaticMarkup(await ReceivablesCurrentResult({report: compactReport, locale, released: currentRelease}));
    const copy = (locale === "en-US" ? en : pt).ReceivablesReleasedResult;
    expect(html).toContain('data-testid="receivables-released-result"');
    expect(html).not.toContain('data-testid="receivables-current-result"');
    // Base and the denominator convention the independent review required on the released output.
    expect(html).toContain(copy.portfolio.preliminaryEligible);
    expect(html).toContain(copy.portfolio.adjustedEligible);
    expect(html).toContain(copy.portfolio.convention);
    // Capacity against the request, concentration against its declared caps.
    expect(html).toContain(copy.facility.supported);
    expect(html).toContain(copy.facility.requested);
    expect(html).toContain(copy.concentration.debtorLimit);
    expect(html).toContain(copy.concentration.groupLimit);
    // The waterfall states its fixed order instead of implying a contractual one.
    expect(html).toContain(copy.waterfall.convention);
    expect(html).toContain(copy.waterfall.items.senior_principal);
    // Triggers, gaps and coverage.
    expect(html).toContain(copy.triggers.ids.single_debtor_concentration);
    expect(html).toContain(copy.coverage.families.roll_rates);
    expect(html).toContain(copy.coverage.aggregateBasis);
    expect(html).toContain(copy.evidence.heading);
    // The limits are part of the result, never a footnote the reader has to look for.
    expect(html).toContain(copy.limitations.noExternalDirection);
    expect(html).toContain(copy.limitations.noFinancierRecommendation);
    expect(html).toContain(copy.limitations.noCreditApproval);
    expect(html).toContain("underwrite-receivables-pool");
    // The rung and the founder approval behind it are stated, never a bare internal token.
    expect(html).toContain(copy.limitations.maturityNames.production);
    expect(html).toContain('data-testid="receivables-released-founder-approval"');
    expect(html).toContain(locale === "en-US" ? "September 10, 2026" : "10 de setembro de 2026");
    expect(html).toContain('data-method-maturity="production"');
    // Internal identifiers stay internal.
    expect(html).not.toContain(content.trace.output_fingerprint);
    expect(html).not.toContain(hash("a"));
    expect(html).not.toContain("analytical_release");
  });

  it("reports an unmeasured history family as not evaluable and never as zero", async () => {
    const html = renderToStaticMarkup(await ReceivablesCurrentResult({report: compactReport, locale: "pt-BR", released: currentRelease}));
    const families = currentRelease.result!.artifact.content.history_coverage!.families;
    const unmeasured = families.filter((family) => family.status === "not_evaluable");
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const family of unmeasured) {
      expect(html).toContain(`data-coverage-status="not_evaluable"`);
      expect(html).toContain(pt.ReceivablesReleasedResult.coverage.families[family.id]);
    }
    expect(html).toContain(pt.ReceivablesReleasedResult.coverage.status.not_evaluable);
    expect(html).toContain(pt.ReceivablesReleasedResult.coverage.note);
  });

  it("keeps today's compact card while the release is paused or nothing was computed", async () => {
    const ungranted = receivablesReleasedResultSchema.parse({
      schemaVersion: "receivables-released-result.v1", state: "not_granted", result: null,
    });
    const html = renderToStaticMarkup(await ReceivablesCurrentResult({report: compactReport, locale: "pt-BR", released: ungranted}));
    expect(html).toContain('data-testid="receivables-current-result"');
    expect(html).not.toContain('data-testid="receivables-released-result"');
    expect(html).toContain(pt.ReceivablesCurrentResult.validated);

    const absent = receivablesReleasedResultSchema.parse({
      schemaVersion: "receivables-released-result.v1", state: "absent", result: null,
    });
    const absentHtml = renderToStaticMarkup(await ReceivablesCurrentResult({report: compactReport, locale: "pt-BR", released: absent}));
    expect(absentHtml).toContain('data-testid="receivables-current-result"');

    const unparseable = renderToStaticMarkup(await ReceivablesCurrentResult({report: compactReport, locale: "pt-BR", released: {state: "current"}}));
    expect(unparseable).toContain('data-testid="receivables-current-result"');
  });

  it("marks a result computed for a replaced selection as superseded and shows no numbers", async () => {
    const superseded = receivablesReleasedResultSchema.parse({
      schemaVersion: "receivables-released-result.v1",
      state: "superseded",
      supersededReason: "scope_replaced",
      previous: {
        createdAt: "2026-09-10T18:00:00Z", outputFingerprint: hash("c"),
        evidenceScopeFingerprint: hash("8"), sourceDatasetHash: hash("a"),
      },
      result: null,
    });
    const html = renderToStaticMarkup(await ReceivablesCurrentResult({report: compactReport, locale: "pt-BR", released: superseded}));
    expect(html).toContain('data-testid="receivables-released-superseded"');
    expect(html).toContain('data-superseded-reason="scope_replaced"');
    expect(html).toContain(pt.ReceivablesReleasedResult.supersededBody);
    expect(html).toContain(pt.ReceivablesReleasedResult.supersededReason.scope_replaced);
    expect(html).not.toContain('data-testid="receivables-released-result"');
    expect(html).not.toContain(pt.ReceivablesReleasedResult.facility.supported);
    expect(html).not.toContain(hash("c"));
  });
});
