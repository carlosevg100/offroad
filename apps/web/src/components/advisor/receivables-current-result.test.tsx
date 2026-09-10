import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {ReceivablesCurrentResult} from "./receivables-current-result";
vi.mock("next-intl/server", () => ({getTranslations: async ({locale}: {locale: string}) => (key: keyof typeof pt.ReceivablesCurrentResult) => (locale === "en-US" ? en : pt).ReceivablesCurrentResult[key]}));
const report = {receivablesVertical: {pipeline: {phaseOne: {staticMetrics: {portfolio: {titleCount: {value: "2"}, totalOpenValue: {value: "2000000"}}}}}, methodReadiness: {state: "ready", gaps: []}, methodExecution: {status: "succeeded", mode: "internal_shadow", externalEffectAllowed: false}}};
describe("current receivables result", () => {
  it.each(["pt-BR", "en-US"] as const)("distinguishes internal validation from a published credit conclusion in %s", async (locale) => {
    const html = renderToStaticMarkup(await ReceivablesCurrentResult({report, locale}));
    const copy = (locale === "en-US" ? en : pt).ReceivablesCurrentResult;
    expect(html).toContain(copy.validated); expect(html).toContain(copy.validatedBody);
    expect(html).not.toContain("internal_shadow"); expect(html).not.toContain("outputFingerprint");
  });
  it("does not render an unrecognized or externally enabled result", async () => {
    expect(await ReceivablesCurrentResult({report: {...report, receivablesVertical: {...report.receivablesVertical, methodExecution: {...report.receivablesVertical.methodExecution, externalEffectAllowed: true}}}, locale: "pt-BR"})).toBeNull();
  });
});
