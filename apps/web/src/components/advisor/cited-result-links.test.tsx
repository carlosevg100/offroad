import {executionResultCitations} from "@offroad/domain-contracts";
import {NextIntlClientProvider} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("server-only", () => ({}));

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import {executionResultHref} from "@/lib/execution/revision";
import {CitedResultLinks} from "./cited-result-links";

const workId = "10000000-0000-4000-8000-000000000001";
const citation = {kind: "execution_result", executionId: "20000000-0000-4000-8000-000000000001", revisionId: "30000000-0000-4000-8000-000000000001"} as const;
/** What the conversation surfaces do with an answer's metadata. */
const linksOf = (locale: "pt-BR" | "en-US", metadata: unknown) => executionResultCitations(metadata).map((cited) => ({href: executionResultHref(locale, workId, cited)}));
const render = (locale: "pt-BR" | "en-US", metadata: unknown) => renderToStaticMarkup(
  <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en}><CitedResultLinks citedResults={linksOf(locale, metadata)} /></NextIntlClientProvider>);

describe("links of an answer that cites execution results", () => {
  it("open the execution's screen on the exact revision the answer read, saying what they open", () => {
    const html = render("pt-BR", {kind: "answer", citations: [citation]});
    expect(html).toContain(`href="/pt-BR/app/projects/${workId}/executions/${citation.executionId}?revision=${citation.revisionId}"`);
    expect(html).toContain(pt.App.advisorProject.openExecutionResult);
    expect(html.replace(/href="[^"]*"/g, "")).not.toContain(citation.revisionId);
    expect(render("en-US", {citations: [citation]})).toContain(en.App.advisorProject.openExecutionResult);
  });
  it("render nothing for an answer that cites nothing or cites malformed ids", () => {
    expect(render("pt-BR", {kind: "answer"})).toBe("");
    expect(render("pt-BR", {citations: [{...citation, revisionId: "x"}]})).toBe("");
  });
});
