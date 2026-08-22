/**
 * Post-closing: a new period comes in, the covenants are tested, the investor is told.
 *
 * The covenant set is what was signed (id, threshold, direction, test frequency). The period
 * brings the inputs the indenture's definitions need: net debt, last-twelve-month EBITDA, net
 * interest, CFADS and debt service, cash, ARR. Each financial covenant is computed the same
 * way every quarter, against the same threshold, and the headroom is stated as a fraction of
 * the threshold, so "folga de 8%" means the same thing on leverage and on coverage. Below
 * ten percent the covenant is on watch; past the threshold it is a breach with the cure clock
 * the indenture gives. No input, no test: the covenant is reported "not testable" with the
 * inputs it lacks, never assumed to pass.
 */

import Decimal from "decimal.js";

import type {Material, MaterialBlock} from "@offroad/case-materials";
import {covenantCatalogue, type CovenantId} from "@offroad/credit-playbook";

export const monitoringVersion = "2026.08.22-v1";

export type CovenantDirection = "max" | "min";

export type AgreedCovenant = {
  id: CovenantId;
  /** The number in the indenture; absent for negative, event and information covenants. */
  threshold?: string;
  direction?: CovenantDirection;
  /** Days to cure after the test date. */
  cureDays?: number;
  /** Threshold steps over time: the first entry whose `from` is on or before the period end applies. */
  steps?: Array<{from: string; threshold: string}>;
};

export type PeriodInputs = {
  periodEnd: string;
  /** Monetary inputs as decimal strings, LTM where the definition says so. */
  netDebt?: string;
  ebitdaLtm?: string;
  netInterestLtm?: string;
  cfadsLtm?: string;
  debtServiceLtm?: string;
  cash?: string;
  arr?: string;
  /** Facts the company reported for the non-financial covenants: a breach is a statement, not a number. */
  declared?: Partial<Record<Exclude<CovenantId, "net_leverage" | "interest_coverage" | "dscr" | "minimum_cash" | "minimum_arr">, {compliant: boolean; note?: string}>>;
  /** Source the numbers came from, for the report. */
  source?: string;
};

export type CovenantStatus = "ok" | "watch" | "breach" | "not_testable";

export type CovenantTest = {
  id: CovenantId;
  labels: {pt: string; en: string};
  status: CovenantStatus;
  actual: string | null;
  threshold: string | null;
  direction: CovenantDirection | null;
  /** (threshold - actual) / threshold, direction-aware; negative when breached. */
  headroom: string | null;
  missing: string[];
  cureBy: string | null;
  note: {pt: string; en: string};
};

export type MonitoringReport = {
  periodEnd: string;
  tests: CovenantTest[];
  worst: CovenantStatus;
  alerts: CovenantTest[];
  summary: {pt: string; en: string};
};

const WATCH_BELOW = new Decimal("0.10");

const financial: Record<"net_leverage" | "interest_coverage" | "dscr" | "minimum_cash" | "minimum_arr", {needs: Array<keyof PeriodInputs>; compute: (p: PeriodInputs) => Decimal | null; defaultDirection: CovenantDirection; format: (v: Decimal) => {pt: string; en: string}}> = {
  net_leverage: {
    needs: ["netDebt", "ebitdaLtm"],
    compute: (p) => (new Decimal(p.ebitdaLtm!).lte(0) ? null : new Decimal(p.netDebt!).div(p.ebitdaLtm!)),
    defaultDirection: "max",
    format: (v) => ({pt: `${v.toFixed(2)}x`, en: `${v.toFixed(2)}x`}),
  },
  interest_coverage: {
    needs: ["ebitdaLtm", "netInterestLtm"],
    compute: (p) => (new Decimal(p.netInterestLtm!).lte(0) ? null : new Decimal(p.ebitdaLtm!).div(p.netInterestLtm!)),
    defaultDirection: "min",
    format: (v) => ({pt: `${v.toFixed(2)}x`, en: `${v.toFixed(2)}x`}),
  },
  dscr: {
    needs: ["cfadsLtm", "debtServiceLtm"],
    compute: (p) => (new Decimal(p.debtServiceLtm!).lte(0) ? null : new Decimal(p.cfadsLtm!).div(p.debtServiceLtm!)),
    defaultDirection: "min",
    format: (v) => ({pt: `${v.toFixed(2)}x`, en: `${v.toFixed(2)}x`}),
  },
  minimum_cash: {
    needs: ["cash"],
    compute: (p) => new Decimal(p.cash!),
    defaultDirection: "min",
    format: (v) => ({pt: `R$ ${v.div(1e6).toFixed(1)}M`, en: `R$ ${v.div(1e6).toFixed(1)}M`}),
  },
  minimum_arr: {
    needs: ["arr"],
    compute: (p) => new Decimal(p.arr!),
    defaultDirection: "min",
    format: (v) => ({pt: `R$ ${v.div(1e6).toFixed(1)}M`, en: `R$ ${v.div(1e6).toFixed(1)}M`}),
  },
};

const isFinancial = (id: CovenantId): id is keyof typeof financial => id in financial;

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const thresholdAt = (covenant: AgreedCovenant, periodEnd: string): string | undefined => {
  const step = [...(covenant.steps ?? [])].filter((entry) => entry.from <= periodEnd).sort((a, b) => b.from.localeCompare(a.from))[0];
  return step?.threshold ?? covenant.threshold;
};

export function testCovenants(agreed: readonly AgreedCovenant[], period: PeriodInputs): MonitoringReport {
  const tests: CovenantTest[] = agreed.map((covenant) => {
    const definition = covenantCatalogue.find((entry) => entry.id === covenant.id);
    const labels = definition?.labels ?? {pt: covenant.id, en: covenant.id};
    const cureBy = covenant.cureDays !== undefined ? addDays(period.periodEnd, covenant.cureDays) : null;

    if (isFinancial(covenant.id)) {
      const rule = financial[covenant.id];
      const threshold = thresholdAt(covenant, period.periodEnd);
      const missing: string[] = rule.needs.filter((key) => period[key] === undefined || period[key] === null);
      if (threshold === undefined) missing.push("threshold");
      const actual = missing.length ? null : rule.compute(period);
      if (actual === null) {
        const why = missing.length ? missing : ["denominator not positive"];
        return {id: covenant.id, labels, status: "not_testable", actual: null, threshold: threshold ?? null, direction: covenant.direction ?? rule.defaultDirection, headroom: null, missing: why, cureBy: null, note: {pt: `Não testável: faltam ${why.join(", ")}.`, en: `Not testable: missing ${why.join(", ")}.`}};
      }
      const direction = covenant.direction ?? rule.defaultDirection;
      const limit = new Decimal(threshold!);
      const headroom = limit.isZero() ? new Decimal(0) : (direction === "max" ? limit.minus(actual).div(limit) : actual.minus(limit).div(limit));
      const status: CovenantStatus = headroom.lt(0) ? "breach" : headroom.lt(WATCH_BELOW) ? "watch" : "ok";
      const shown = rule.format(actual);
      const pct = headroom.times(100).toFixed(1);
      return {
        id: covenant.id,
        labels,
        status,
        actual: actual.toDecimalPlaces(6).toFixed(),
        threshold: limit.toFixed(),
        direction,
        headroom: headroom.toDecimalPlaces(4).toFixed(),
        missing: [],
        cureBy: status === "breach" ? cureBy : null,
        note:
          status === "breach"
            ? {pt: `${shown.pt} contra ${direction === "max" ? "máximo" : "mínimo"} de ${limit.toFixed()}: violado por ${pct.replace("-", "")}%${cureBy ? `; cura até ${cureBy}` : ""}.`, en: `${shown.en} against a ${direction === "max" ? "maximum" : "minimum"} of ${limit.toFixed()}: breached by ${pct.replace("-", "")}%${cureBy ? `; cure by ${cureBy}` : ""}.`}
            : status === "watch"
              ? {pt: `${shown.pt} contra ${limit.toFixed()}: folga de ${pct}%, abaixo de 10%.`, en: `${shown.en} against ${limit.toFixed()}: ${pct}% headroom, below 10%.`}
              : {pt: `${shown.pt} contra ${limit.toFixed()}: folga de ${pct}%.`, en: `${shown.en} against ${limit.toFixed()}: ${pct}% headroom.`},
      };
    }

    const declared = period.declared?.[covenant.id as keyof NonNullable<PeriodInputs["declared"]>];
    if (!declared) return {id: covenant.id, labels, status: "not_testable", actual: null, threshold: null, direction: null, headroom: null, missing: ["declaration"], cureBy: null, note: {pt: "Sem declaração da companhia neste período.", en: "No declaration from the company this period."}};
    return {
      id: covenant.id,
      labels,
      status: declared.compliant ? "ok" : "breach",
      actual: declared.compliant ? "compliant" : "breached",
      threshold: null,
      direction: null,
      headroom: null,
      missing: [],
      cureBy: declared.compliant ? null : cureBy,
      note: declared.compliant ? {pt: `Cumprido${declared.note ? `: ${declared.note}` : ""}.`, en: `Complied${declared.note ? `: ${declared.note}` : ""}.`} : {pt: `Descumprido${declared.note ? `: ${declared.note}` : ""}${cureBy ? `; cura até ${cureBy}` : ""}.`, en: `Breached${declared.note ? `: ${declared.note}` : ""}${cureBy ? `; cure by ${cureBy}` : ""}.`},
    };
  });

  const order: CovenantStatus[] = ["ok", "not_testable", "watch", "breach"];
  const worst = tests.reduce<CovenantStatus>((acc, test) => (order.indexOf(test.status) > order.indexOf(acc) ? test.status : acc), "ok");
  const alerts = tests.filter((test) => test.status === "watch" || test.status === "breach");
  const counts = {ok: tests.filter((t) => t.status === "ok").length, watch: tests.filter((t) => t.status === "watch").length, breach: tests.filter((t) => t.status === "breach").length, nt: tests.filter((t) => t.status === "not_testable").length};
  return {
    periodEnd: period.periodEnd,
    tests,
    worst,
    alerts,
    summary: {
      pt: `${period.periodEnd}: ${counts.ok} cumpridos, ${counts.watch} em atenção, ${counts.breach} violados, ${counts.nt} não testáveis.`,
      en: `${period.periodEnd}: ${counts.ok} complied, ${counts.watch} on watch, ${counts.breach} breached, ${counts.nt} not testable.`,
    },
  };
}

/** The quarterly report to the investor: every covenant, its number, its headroom, and what is missing. */
export function monitoringMaterial(report: MonitoringReport, input: {companyName?: string; source?: string}): Material {
  const status: Record<CovenantStatus, {pt: string; en: string}> = {ok: {pt: "Cumprido", en: "Complied"}, watch: {pt: "Atenção", en: "Watch"}, breach: {pt: "Violado", en: "Breached"}, not_testable: {pt: "Não testável", en: "Not testable"}};
  const blocks: MaterialBlock[] = [
    {type: "callout", title: {pt: "Resumo do período", en: "Period summary"}, items: [
      {label: {pt: "Período", en: "Period"}, value: {pt: report.periodEnd, en: report.periodEnd}},
      {label: {pt: "Situação", en: "Status"}, value: status[report.worst]},
      ...(input.source ? [{label: {pt: "Fonte", en: "Source"}, value: {pt: input.source, en: input.source}}] : []),
    ]},
    {type: "paragraph", text: report.summary},
    {type: "table", caption: {pt: "Aferição dos covenants", en: "Covenant tests"}, head: [{pt: "Covenant", en: "Covenant"}, {pt: "Apurado", en: "Actual"}, {pt: "Limite", en: "Threshold"}, {pt: "Folga", en: "Headroom"}, {pt: "Situação", en: "Status"}],
      rows: report.tests.map((test) => [test.labels.pt, test.actual ?? "", test.threshold ?? "", test.headroom !== null ? `${(Number(test.headroom) * 100).toFixed(1)}%` : "", status[test.status].pt])},
  ];
  if (report.alerts.length) blocks.push({type: "list", items: report.alerts.map((test) => test.note)});
  const missing = report.tests.filter((test) => test.status === "not_testable");
  if (missing.length) blocks.push({type: "kv", caption: {pt: "O que falta para testar", en: "What is missing to test"}, rows: missing.map((test) => ({label: test.labels, value: {pt: test.missing.join(", "), en: test.missing.join(", ")}}))});
  blocks.push({type: "disclaimer", text: {pt: "Aferição aritmética sobre os números reportados pela companhia, nas definições da escritura. Não substitui a certificação do agente fiduciário.", en: "Arithmetic test over the numbers the company reported, under the indenture's definitions. It does not replace the trustee's certification."}});
  return {kind: "credit_profile", title: {pt: `Relatório de covenants${input.companyName ? `: ${input.companyName}` : ""}`, en: `Covenant report${input.companyName ? `: ${input.companyName}` : ""}`}, blocks, dependsOn: report.tests.map((test) => `covenant:${test.id}:${report.periodEnd}`)};
}
