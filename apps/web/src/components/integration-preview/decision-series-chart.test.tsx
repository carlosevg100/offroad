import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import type {DecisionArtifactContract} from "@offroad/case-understanding";
import {DecisionSeriesChart} from "./decision-series-chart";

type Series = NonNullable<DecisionArtifactContract["series"]>[number];
function series(chartKind: Series["chartKind"], values: (number | null)[]): Series {
  return {id: "synthetic-series", label: "Synthetic series", unit: "declared units", chartKind,
    object: {id: "synthetic-object", type: "scenario", fingerprint: "a".repeat(64), path: "/series"},
    points: values.map((value, index) => ({label: `Point ${index + 1}`, value,
      evidenceState: value === null ? "not_computable" : "calculated", sourceIds: [], assumptionIds: [], gapIds: []}))};
}
function render(input: Series, locale: "pt-BR" | "en-US" = "en-US") {
  return renderToStaticMarkup(<DecisionSeriesChart series={input} locale={locale} missingLabel="not computable" />);
}

describe("decision series geometry", () => {
  it.each(["column", "bar", "line"] as const)("renders signed %s values without mutating the signed series", (kind) => {
    const input = series(kind, [-12.5, 0, null, 25]);
    const before = structuredClone(input);
    const html = render(input, "pt-BR");
    expect(input).toEqual(before);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain("-12,5 declared units");
    expect(html).toContain("25 declared units");
    expect(html.match(/data-point-state="missing"/g)).toHaveLength(1);
    expect(html).toContain("not computable</text>");
    expect(html).not.toMatch(/(?:x|y|width|height|cx|cy)="(?:NaN|Infinity|-Infinity)/);
  });
  it("breaks a line across missing evidence instead of interpolating it", () => {
    const html = render(series("line", [2, 4, null, 8, 10]));
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html.match(/<circle /g)).toHaveLength(4);
    expect(html).toContain('data-point-state="missing"');
  });
  it.each(["column", "bar"] as const)("uses one zero baseline for negative and positive %s geometry", (kind) => {
    const html = render(series(kind, [-10, 10]));
    const rects = [...html.matchAll(/<rect ([^>]+)/g)].map((match) => Object.fromEntries([...match[1]!.matchAll(/\b(x|y|width|height)="([^"]+)"/g)].map((attribute) => [attribute[1], Number(attribute[2])])));
    expect(rects).toHaveLength(2);
    if (kind === "column") {
      expect(rects[0]!.height).toBe(rects[1]!.height);
      expect(rects[1]!.y! + rects[1]!.height!).toBe(rects[0]!.y);
    } else {
      expect(rects[0]!.width).toBe(rects[1]!.width);
      expect(rects[0]!.x! + rects[0]!.width!).toBe(rects[1]!.x);
    }
  });
  it("does not draw missing-only or empty series as zero", () => {
    expect(render(series("column", [null, null]))).toBe("");
    expect(render(series("line", []))).toBe("");
  });
  it("retains zero marks and finite geometry for extreme and constant domains", () => {
    for (const values of [[0, 0], [-Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE, Number.MIN_VALUE]]) {
      const html = render(series("column", values));
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
      expect(html.match(/data-point-state="value"/g)).toHaveLength(2);
    }
  });
  it("escapes supplied labels and keeps arbitrary units without inferred conversion", () => {
    const input = series("bar", [0.25]);
    input.points[0]!.label = "<script>bad</script>";
    input.unit = "BRL thousand";
    const html = render(input);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("0.25 BRL thousand");
    expect(html).not.toContain("25%");
  });
  it("keeps dense bars bounded and avoids repeating overlapping plot amounts", () => {
    const input = series("bar", Array.from({length: 120}, (_, index) => index * 1000000));
    const html = render(input);
    expect(html).toContain('viewBox="0 0 640 640"');
    expect(html).toContain('overflow:hidden');
    expect(html.match(/<rect /g)).toHaveLength(120);
    expect(html.match(/<text /g)).toHaveLength(12);
    expect(html).toContain('Point 120: 119,000,000 declared units');
  });

});
