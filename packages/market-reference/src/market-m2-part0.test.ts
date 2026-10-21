import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {availableForDataBase, canonicalInstant, dataBaseLimit, instantMicros} from "./market-availability";
import {canonicalSha256V2, canonicalTextV2, type CanonicalV2Input} from "./market-canonical-v2";
import {manifestSha256, selectPeriods, type PeriodRevocation, type SelectableVersion} from "./market-period-selection";
import {
  checkCommuniqueUrl, checkSelicTargetUrl, communiquePlainText, communiqueRecordSha256, communiqueUrl, parseCommuniqueDetail, parseCommuniqueList,
  parseSelicTarget, selicTargetContractSha256, selicTargetUrl,
} from "./selic-target-contract";
import {compareDecimal, evaluateSelicTarget, type AcquiredCommunique} from "./selic-target-quality";
import {JsonNumber, strictJsonParse} from "./strict-json";

const vectors = JSON.parse(readFileSync(new URL("../vectors/market-m2-part0.json", import.meta.url), "utf8")) as {
  seriesContractSha256: string;
  canonicalV2: {name: string; input: CanonicalV2Input; canonical: string; sha256: string}[];
  canonicalV2Refusals: {name: string; input: CanonicalV2Input; error: string}[];
  dataBaseLimits: {dataBase: string; limit: string}[];
  eligibility: {dataBase: string; acquiredAt: string; eligible: boolean}[];
  communiqueRecords: {record: Parameters<typeof communiqueRecordSha256>[0]; sha256: string}[];
};
const bytes = (value: unknown) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const window = {start: "2026-09-14", end: "2026-09-20"};

describe("shared vectors (TypeScript side; the SQL of part 1 reproduces the same file)", () => {
  it("names the SGS 432 contract by the same fingerprint", () => expect(selicTargetContractSha256()).toBe(vectors.seriesContractSha256));
  it.each(vectors.canonicalV2)("canonical v2: $name", (v) => {
    expect(canonicalTextV2(v.input)).toBe(v.canonical);
    expect(canonicalSha256V2(v.input)).toBe(v.sha256);
  });
  it.each(vectors.communiqueRecords)("communiqué record of meeting $record.nro_reuniao", (v) => expect(communiqueRecordSha256(v.record)).toBe(v.sha256));
  it.each(vectors.canonicalV2Refusals)("canonical v2 refuses: $name", (v) => expect(() => canonicalTextV2(v.input)).toThrow(v.error));
  it.each(vectors.dataBaseLimits)("limit of data-base $dataBase", (v) => expect(dataBaseLimit(v.dataBase)).toBe(v.limit));
  it.each(vectors.eligibility)("eligibility of $acquiredAt for $dataBase", (v) =>
    expect(availableForDataBase({acquiredAt: v.acquiredAt, availableAt: v.acquiredAt}, v.dataBase)).toBe(v.eligible));
});

describe("instants keep the database's microseconds", () => {
  it("orders and formats microseconds", () => {
    expect(instantMicros("2026-10-21T15:04:05.000002Z") > instantMicros("2026-10-21T15:04:05.000001Z")).toBe(true);
    expect(canonicalInstant("2026-10-21T12:04:05.000002-03:00")).toBe("2026-10-21T15:04:05.000002Z");
    expect(canonicalInstant("1999-12-31T23:59:59.999999Z")).toBe("1999-12-31T23:59:59.999999Z");
    expect(() => instantMicros("2026-02-30T00:00:00Z")).toThrow("market_instant_invalid");
    expect(() => canonicalInstant("9999-12-31T23:59:59.123456-03:00")).toThrow("market_instant_out_of_range");
    expect(() => canonicalInstant("1899-12-31T23:59:59Z")).toThrow("market_instant_out_of_range");
  });
});

describe("canonical v2 binds every new field", () => {
  const base = vectors.canonicalV2[0]!.input;
  const tampered: [string, (x: CanonicalV2Input) => CanonicalV2Input][] = [
    ["source revision", (x) => ({...x, sourceRevisionId: "6f1c2a40-8d3e-4b7a-9c11-2e5f8a9b0c02"})],
    ["series contract", (x) => ({...x, seriesContract: {...x.seriesContract, sha256: "0".repeat(64)}})],
    ["parser", (x) => ({...x, parser: "bcb-sgs-daily-json.v3"})],
    ["quality policy", (x) => ({...x, qualityPolicy: {...x.qualityPolicy, version: "v3"}})],
    ["supersedes", (x) => ({...x, supersedes: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f"})],
    ["link meeting", (x) => ({...x, links: [{...x.links[0]!, meeting: 280}]})],
    ["link date", (x) => ({...x, links: [{...x.links[0]!, referenceDate: "2026-09-17"}]})],
    ["link decision", (x) => ({...x, links: [{...x.links[0]!, decision: "hold"}]})],
    ["link value", (x) => ({...x, links: [{...x.links[0]!, targetPct: "13.5"}]})],
    ["link record", (x) => ({...x, links: [{...x.links[0]!, recordSha256: "f".repeat(64)}]})],
    ["link acquisition", (x) => ({...x, links: [{...x.links[0]!, acquisitionId: "9e2b4c61-7d8a-4f3e-a5b9-1c2d3e4f5a69"}]})],
    ["one microsecond of an instant", (x) => ({...x, observations: x.observations.map((o, i) => i === 0 ? {...o, acquiredAt: "2026-10-21T15:04:05.123457Z"} : o)})],
  ];
  it.each(tampered)("%s, with the same dates and values", (_, mutate) => expect(canonicalSha256V2(mutate(base))).not.toBe(canonicalSha256V2(base)));
});

describe("closed URLs: byte-equal to the contract or refused", () => {
  const q = "formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026";
  it("builds the only series URL and accepts it back", () => {
    const url = selicTargetUrl(window);
    expect(url).toBe(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}`);
    expect(checkSelicTargetUrl(url, window)).toBe(true);
  });
  it.each([
    ["the CDI, series 12, on the same host", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?${q}`, "market_url_endpoint"],
    ["the CDI, series 4389", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados?${q}`, "market_url_endpoint"],
    ["a dot segment that normalises to 432", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/../bcdata.sgs.432/dados?${q}`, "market_url_endpoint"],
    ["a percent-encoded path", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.%34%33%32/dados?${q}`, "market_url_endpoint"],
    ["a trailing slash", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/?${q}`, "market_url_endpoint"],
    ["percent-encoded parameters", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14%2F09%2F2026&dataFinal=20/09/2026", "market_url_parameters"],
    ["another window", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=01/09/2026&dataFinal=20/09/2026", "market_url_parameters"],
    ["a repeated parameter", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}&dataInicial=14/09/2026`, "market_url_parameters"],
    ["parameters in another order", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?dataInicial=14/09/2026&formato=json&dataFinal=20/09/2026", "market_url_parameters"],
    ["csv", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=csv&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_parameters"],
    ["the default port written out", `https://api.bcb.gov.br:443/dados/serie/bcdata.sgs.432/dados?${q}`, "market_url_not_allowed"],
    ["an empty fragment", `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}#`, "market_url_not_allowed"],
    ["credentials", `https://user@api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}`, "market_url_not_allowed"],
    ["a capitalised host", `https://API.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}`, "market_url_not_allowed"],
    ["a percent-encoded host", `https://api%2Ebcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}`, "market_url_not_allowed"],
    ["another host", `https://www.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}`, "market_url_host"],
    ["plain http", `http://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?${q}`, "market_url_not_allowed"],
  ])("refuses %s", (_, url, code) => expect(() => checkSelicTargetUrl(url, window)).toThrow(code));
  it("refuses windows outside the contract", () => {
    expect(() => selicTargetUrl({start: "2021-01-13", end: "2021-02-01"})).toThrow("market_window_before_homologation");
    expect(() => selicTargetUrl({start: "2021-01-14", end: "2031-01-14"})).toThrow("market_window_too_long");
    expect(selicTargetUrl({start: "2021-01-14", end: "2031-01-13"})).toContain("dataFinal=13/01/2031");
    expect(() => selicTargetUrl({start: "2026-09-20", end: "2026-09-14"})).toThrow("market_window_reversed");
  });
  it("closes the communiqué endpoints", () => {
    expect(communiqueUrl({kind: "detail", meeting: 281})).toBe("https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados_detalhes?nro_reuniao=281");
    expect(checkCommuniqueUrl("https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados?quantidade=60", {kind: "list", size: 60})).toBe(true);
    expect(() => checkCommuniqueUrl("https://www.bcb.gov.br/api/servico/sitebcb/copom/atas_detalhes?nro_reuniao=281", {kind: "detail", meeting: 281})).toThrow("market_url_endpoint");
    expect(() => checkCommuniqueUrl("https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados_detalhes?nro_reuniao=280", {kind: "detail", meeting: 281})).toThrow("market_url_parameters");
    expect(() => checkCommuniqueUrl("https://www.bcb.gov.br/api/servico/sitebcb/copom/comunicados_detalhes?nro_reuniao=0281", {kind: "detail", meeting: 281})).toThrow("market_url_parameters");
    expect(() => communiqueUrl({kind: "list", size: 101})).toThrow("market_communique_list_size");
  });
});

describe("strict JSON", () => {
  it.each([
    ["a repeated key", "{\"a\":1,\"a\":2}", "json_duplicate_key"],
    ["a byte order mark", "\uFEFF[]", "json_bom"],
    ["a lone surrogate", "[\"\\ud800\"]", "json_lone_surrogate"],
    ["a lone low surrogate", "[\"\\udc00x\"]", "json_lone_surrogate"],
    ["NUL", "[\"a\\u0000\"]", "json_nul"],
    ["a raw control character", "[\"a\nb\"]", "json_syntax"],
    ["trailing text", "[] x", "json_syntax"],
    ["a trailing comma", "[1,]", "json_syntax"],
    ["a leading zero", "[01]", "json_syntax"],
  ])("refuses %s", (_, text, code) => expect(() => strictJsonParse(bytes(text))).toThrow(code));
  it("keeps a valid supplementary character and the JSON types", () => {
    const v = strictJsonParse(bytes("{\"x\":\"\\ud83d\\ude00 ok\",\"n\":1.50,\"s\":\"1.50\",\"__proto__\":null}")) as Record<string, unknown>;
    expect([v.x, (v.n as JsonNumber).raw, v.s, Object.keys(v)]).toEqual(["\u{1F600} ok", "1.50", "1.50", ["x", "n", "s", "__proto__"]]);
  });
});

describe("SGS 432 parser", () => {
  const row = (d: string, v: string) => ({data: d, valor: v});
  it("reads the daily answer", () => expect(parseSelicTarget(bytes([row("16/09/2026", "14.00"), row("17/09/2026", "13.75")]), window))
    .toEqual([{period: "2026-09-16", value: "14.00"}, {period: "2026-09-17", value: "13.75"}]));
  it.each([
    ["the HTML error page a browser agent receives with status 200", "<?xml version=\"1.0\"?><html><title>Requisição inválida!</title></html>", "market_parse_json_syntax"],
    ["a byte order mark, which Postgres would not accept either", `\uFEFF${JSON.stringify([row("16/09/2026", "14.00")])}`, "market_parse_json_bom"],
    ["a repeated key that would hide the first value", "[{\"data\":\"16/09/2026\",\"valor\":\"99.00\",\"valor\":\"12.25\"}]", "market_parse_json_duplicate_key"],
    ["an empty answer", [], "market_parse_empty"],
    ["a repeated day", [row("16/09/2026", "14.00"), row("16/09/2026", "14.00")], "market_parse_duplicate_period"],
    ["unordered days", [row("17/09/2026", "13.75"), row("16/09/2026", "14.00")], "market_parse_unordered"],
    ["a day outside the window", [row("21/09/2026", "13.75")], "market_parse_outside_window"],
    ["an extra field", [{...row("16/09/2026", "14.00"), fonte: "x"}], "market_parse_row"],
    ["a number instead of text", [{data: "16/09/2026", valor: 14}], "market_parse_row"],
    ["a value with a comma", [row("16/09/2026", "14,00")], "market_parse_value"],
    ["a leading zero", [row("16/09/2026", "012.75")], "market_parse_value"],
    ["an impossible date", [row("31/09/2026", "14.00")], "market_parse_date"],
    ["an object instead of an array", {dados: []}, "market_parse_not_array"],
  ])("fails the attempt on %s", (_, body, code) => expect(() => parseSelicTarget(bytes(body), window)).toThrow(code));
});

describe("communiqué parser", () => {
  const record = {nro_reuniao: 281, dataReferencia: "2026-09-16", titulo: "281ª reunião - Copom reduz a taxa Selic para  13,75% a.a.",
    textoComunicado: "<p>Texto sintético de teste. O Copom decidiu reduzir a taxa básica de juros para 13,75%&nbsp;a.a. Projeções de 4,50% a.a. não são a decisão.</p>"};
  const detail = (r: Record<string, unknown>) => bytes({conteudo: [r]});
  it("reads value, decision, the day the series changes and the regulatory date", () => {
    expect(parseCommuniqueDetail(detail(record), 281)).toEqual({meeting: 281, referenceDate: "2026-09-16", decision: "cut", targetPct: "13.75",
      recordSha256: communiqueRecordSha256(record), seriesChangeDate: "2026-09-17", regulatoryEffectiveFrom: "2026-09-17"});
  });
  it("separates the series day from the regulatory day on the eve of a holiday (Finados 2023)", () => {
    const c = parseCommuniqueDetail(detail({nro_reuniao: 258, dataReferencia: "2023-11-01", titulo: "258ª reunião - Copom reduz a taxa Selic para 12,25% a.a.",
      textoComunicado: "<p>O Copom decidiu reduzir a taxa básica de juros para 12,25% a.a.</p>"}), 258);
    expect([c.seriesChangeDate, c.regulatoryEffectiveFrom]).toEqual(["2023-11-02", "2023-11-03"]);
  });
  it("accepts the step wording, an adverbial phrase in prose and a gerund after a comma", () => {
    expect(parseCommuniqueDetail(detail({...record, textoComunicado: "<p>Diante do elevado grau de incerteza, o Copom decidiu reduzir a taxa básica de juros em 0,25 ponto percentual, para 13,75% a.a.</p>"}), 281).targetPct).toBe("13.75");
    expect(parseCommuniqueDetail(detail({...record, textoComunicado: "<p>O Comitê julgou apropriado, nesse momento, dar sequência ao ciclo, reduzindo a taxa básica de juros para 13,75% a.a.</p>"}), 281).targetPct).toBe("13.75");
    expect(parseCommuniqueDetail(detail({...record, textoComunicado: "<p>O Copom decidiu, por unanimidade, reduzir a taxa Selic para 13,75% a.a. [...] o Comitê decidiu reduzir a taxa para 13,50% a.a. num cenário</p>"}), 281).targetPct).toBe("13.75");
  });
  it("binds the record fingerprint to every field", () => {
    expect(communiqueRecordSha256({...record, textoComunicado: `${record.textoComunicado} `})).not.toBe(communiqueRecordSha256(record));
    expect(communiqueRecordSha256({...record, titulo: record.titulo.replace("  ", " ")})).not.toBe(communiqueRecordSha256(record));
  });
  it.each([
    ["another meeting", {conteudo: [{...record, nro_reuniao: 280}]}, "market_parse_communique_meeting"],
    ["two records", {conteudo: [record, record]}, "market_parse_communique_shape"],
    ["an undocumented field", {conteudo: [{...record, link: "x"}]}, "market_parse_communique_fields"],
    ["a title with two rates", {conteudo: [{...record, titulo: "Copom reduz a taxa Selic de 14,00% a.a. para 13,75% a.a."}]}, "market_parse_communique_title"],
    ["a rate whose integer part has three digits", {conteudo: [{...record, titulo: "Copom reduz a taxa Selic para 112,25% a.a."}]}, "market_parse_communique_title"],
    ["a title without a decision verb", {conteudo: [{...record, titulo: "Copom: taxa Selic em 13,75% a.a."}]}, "market_parse_communique_title"],
    ["a text without a decision clause", {conteudo: [{...record, textoComunicado: "<p>A taxa passa a 13,75% a.a. Cenário de 4,50% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a negative rate in the title", {conteudo: [{...record, titulo: "Copom reduz a taxa Selic para -13,75% a.a."}]}, "market_parse_communique_title"],
    ["a confirming clause only with another rate", {conteudo: [{...record, textoComunicado: "<p>O Copom decidiu reduzir a taxa básica de juros para 13,50% a.a. No cenário alternativo, 13,75% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a text that raises when the title cuts", {conteudo: [{...record, textoComunicado: "<p>O Copom decidiu elevar a taxa básica de juros para 13,75% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a wording outside the grammar", {conteudo: [{...record, textoComunicado: "<p>O Copom decidiu fixar a taxa básica de juros em 13,75% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a negation right before the clause", {conteudo: [{...record, textoComunicado: "<p>O Copom não decidiu reduzir a taxa Selic para 13,75% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a negated decision", {conteudo: [{...record, textoComunicado: "<p>O Copom decidiu não reduzir, mas elevar a taxa para 13,75% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a sign separated by a space or a tag", {conteudo: [{...record, textoComunicado: "<p>O Copom decidiu reduzir a taxa básica de juros para - <b>13,75</b>% a.a.</p>"}]}, "market_parse_communique_text"],
    ["a cut that says em", {conteudo: [{...record, textoComunicado: "<p>O Copom decidiu reduzir a taxa básica de juros em 13,75% a.a.</p>"}]}, "market_parse_communique_text"],
    ["an impossible date", {conteudo: [{...record, dataReferencia: "2026-02-30"}]}, "market_parse_communique_date"],
  ])("refuses %s", (_, body, code) => expect(() => parseCommuniqueDetail(bytes(body), 281)).toThrow(code));
  it("refuses strings Postgres cannot hold the same way", () => {
    const raw = JSON.stringify({conteudo: [record]});
    expect(() => parseCommuniqueDetail(bytes(raw.replace("Texto", "Texto\\ud800")), 281)).toThrow("market_parse_json_lone_surrogate");
    expect(() => parseCommuniqueDetail(bytes(raw.replace("Texto", "Texto\\u0000")), 281)).toThrow("market_parse_json_nul");
  });
  it("strips tags and zeros in linear time on adversarial input", () => {
    const start = Date.now();
    expect(communiquePlainText("<".repeat(200_000))).toBe("<".repeat(200_000));
    expect(compareDecimal(`${"0".repeat(100_000)}1`, `1.${"0".repeat(100_000)}`)).toBe(0);
    expect(communiquePlainText("a<b<c>d")).toBe("a d");
    expect(Date.now() - start).toBeLessThan(2000);
  });
  it("reads the list only to discover meetings, in decreasing order", () => {
    const list = {conteudo: [{nro_reuniao: 281, dataReferencia: "2026-09-16", titulo: "a"}, {nro_reuniao: 280, dataReferencia: "2026-08-05", titulo: "b"}]};
    expect(parseCommuniqueList(bytes(list), 5).map((m) => m.meeting)).toEqual([281, 280]);
    expect(() => parseCommuniqueList(bytes({conteudo: [...list.conteudo].reverse()}), 5)).toThrow("market_parse_communique_order");
    expect(() => parseCommuniqueList(bytes(list), 1)).toThrow("market_parse_communique_list_size");
  });
});

describe("quality and joint eligibility of series and communiqué", () => {
  const at = (local: string) => `${local}-03:00`;
  const qWindow = {start: "2026-09-15", end: "2026-09-18"};
  const series = (acquiredAt: string) => [["2026-09-15", "14.00"], ["2026-09-16", "14.00"], ["2026-09-17", "13.75"], ["2026-09-18", "13.75"]]
    .map(([period, value]) => ({period: period!, value: value!, acquiredAt}));
  const com = (meeting: number, referenceDate: string, decision: AcquiredCommunique["decision"], targetPct: string, acquiredAt: string): AcquiredCommunique =>
    ({meeting, referenceDate, decision, targetPct, recordSha256: String(meeting % 10).repeat(64), seriesChangeDate: new Date(Date.parse(`${referenceDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10), regulatoryEffectiveFrom: "", acquiredAt});
  const c280 = com(280, "2026-08-05", "cut", "14.00", at("2026-09-01T10:00:00"));
  const c281 = (acquiredAt: string) => com(281, "2026-09-16", "cut", "13.75", acquiredAt);
  it("links the change when both were acquired the same day, up to the last microsecond", () => {
    const q = evaluateSelicTarget({observations: series(at("2026-09-18T10:00:00")), communiques: [c280, c281(at("2026-09-18T23:59:59.999999"))], window: qWindow, dataBase: "2026-09-18"});
    expect(q.status).toBe("approved");
    expect(q.anchor).toEqual({meeting: 280, recordSha256: "0".repeat(64)});
    expect(q.links).toEqual([{period: "2026-09-17", from: "14.00", to: "13.75", meeting: 281, recordSha256: "1".repeat(64)}]);
  });
  it("quarantines the change for D when the communiqué arrives exactly at the limit, and links it for D+1", () => {
    const input = {observations: series(at("2026-09-18T10:00:00")), communiques: [c280, c281(at("2026-09-19T00:00:00"))], window: qWindow};
    expect(evaluateSelicTarget({...input, dataBase: "2026-09-18"}).findings).toEqual([{code: "change_without_communique", period: "2026-09-17", from: "14.00", to: "13.75"}]);
    expect(evaluateSelicTarget({...input, dataBase: "2026-09-19"}).status).toBe("approved");
  });
  it("does not approve a window whose first level nothing supports", () => {
    const one = [{period: "2023-11-02", value: "12.25", acquiredAt: at("2026-10-21T10:00:00")}];
    const w = {start: "2023-11-02", end: "2023-11-02"};
    expect(evaluateSelicTarget({observations: one, communiques: [], window: w, dataBase: "2026-10-21"}).findings).toEqual([{code: "start_without_anchor", period: "2023-11-02"}]);
    const late = com(258, "2023-11-01", "cut", "12.25", at("2026-10-22T00:00:00"));
    expect(evaluateSelicTarget({observations: one, communiques: [late], window: w, dataBase: "2026-10-21"}).status).toBe("quarantined");
    expect(evaluateSelicTarget({observations: one, communiques: [{...late, acquiredAt: at("2026-10-21T10:00:00")}], window: w, dataBase: "2026-10-21"}).status).toBe("approved");
    expect(evaluateSelicTarget({observations: one, communiques: [{...late, targetPct: "12.75", acquiredAt: at("2026-10-21T10:00:00")}], window: w, dataBase: "2026-10-21"}).findings).toEqual([{code: "anchor_value_mismatch", period: "2023-11-02", meeting: 258}]);
  });
  it("checks coverage of the whole window and tells absence from approval", () => {
    const obs = series(at("2026-09-18T10:00:00"));
    const run = (o: typeof obs) => evaluateSelicTarget({observations: o, communiques: [c280, c281(at("2026-09-18T10:00:00"))], window: qWindow, dataBase: "2026-09-18"});
    expect(run(obs.slice(1)).findings).toEqual([{code: "calendar_gap", period: "2026-09-15"}]);
    expect(run(obs.slice(0, 3)).findings).toEqual([{code: "calendar_gap", period: "2026-09-18"}]);
    expect(run([]).status).toBe("insufficient");
  });
  it("follows the series on the calendar day after an extraordinary meeting on a Monday", () => {
    const obs = [["2026-03-09", "15.00"], ["2026-03-10", "14.00"], ["2026-03-11", "14.00"]].map(([period, value]) => ({period: period!, value: value!, acquiredAt: at("2026-10-21T10:00:00")}));
    const anchor = com(276, "2026-01-28", "hold", "15.00", at("2026-10-21T10:00:00"));
    const extra = com(900, "2026-03-09", "cut", "14.00", at("2026-10-21T10:00:00"));
    expect(evaluateSelicTarget({observations: obs, communiques: [anchor, extra], window: {start: "2026-03-09", end: "2026-03-11"}, dataBase: "2026-10-21"}).status).toBe("approved");
  });
  it("compares values numerically, finds a contradicted hold, a raise without change and a value out of range", () => {
    expect(compareDecimal("012.75", "12.75")).toBe(0);
    const hold = {...c281(at("2026-09-18T10:00:00")), decision: "hold" as const};
    expect(evaluateSelicTarget({observations: series(at("2026-09-18T10:00:00")), communiques: [c280, hold], window: qWindow, dataBase: "2026-09-18"}).findings)
      .toEqual([{code: "communique_direction_mismatch", period: "2026-09-17", meeting: 281}]);
    const flat = series(at("2026-09-18T10:00:00")).map((o) => ({...o, value: "14.00"}));
    const raise = {...c281(at("2026-09-18T10:00:00")), decision: "raise" as const, targetPct: "14.00"};
    expect(evaluateSelicTarget({observations: flat, communiques: [c280, raise], window: qWindow, dataBase: "2026-09-18"}).findings).toEqual([{code: "communique_direction_mismatch", period: "2026-09-17", meeting: 281}]);
    const high = series(at("2026-09-18T10:00:00")).map((o) => o.period === "2026-09-18" ? {...o, value: "100.25"} : o);
    expect(evaluateSelicTarget({observations: high, communiques: [c280, c281(at("2026-09-18T10:00:00"))], window: qWindow, dataBase: "2026-09-18"}).findings.map((f) => f.code)).toEqual(["value_out_of_range", "change_without_communique"]);
  });
});

describe("per-period selection", () => {
  const id = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-00000000000${n}`;
  const v = (n: number, acquiredAt: string, periods: string[], extra: Partial<SelectableVersion> = {}): SelectableVersion =>
    ({id: id("00", n), acquisitionId: id("10", n), acquiredAt, recordedAt: acquiredAt, supersedes: null, periods, ...extra});
  const run = (versions: SelectableVersion[], extra: Partial<Parameters<typeof selectPeriods>[0]> = {}) =>
    selectPeriods({versions, revocations: [], dataBase: "2026-09-30", knowledgeAt: "2026-10-21T12:00:00Z", window: {start: "2026-09-01", end: "2026-09-30"}, allowed: () => true, ...extra});
  const older = v(1, "2026-09-20T12:00:00Z", ["2026-09-16", "2026-09-17", "2026-09-18"]);
  const newer = v(2, "2026-09-25T12:00:00Z", ["2026-09-17", "2026-09-18", "2026-09-19"]);
  const revocation = (extra: Partial<PeriodRevocation> = {}): PeriodRevocation =>
    ({id: id("20", 1), period: "2026-09-17", acquiredAt: "2026-09-26T12:00:00Z", recordedAt: "2026-09-26T12:00:00Z", evidenceSha256: "c".repeat(64), ...extra});
  it("takes the most recent acquisition per period, whatever order they were confirmed in", () => {
    const expected = [{period: "2026-09-16", versionId: older.id}, {period: "2026-09-17", versionId: newer.id}, {period: "2026-09-18", versionId: newer.id}, {period: "2026-09-19", versionId: newer.id}];
    expect(run([older, newer])).toEqual(expected);
    expect(run([newer, older])).toEqual(expected);
  });
  it("decides by microseconds before the id tie-break", () => {
    const a = v(3, "2026-09-25T12:00:00.000002Z", ["2026-09-19"]), b = v(9, "2026-09-25T12:00:00.000001Z", ["2026-09-19"]);
    expect(run([a, b])[0]!.versionId).toBe(a.id);
    const tie = v(3, "2026-09-25T12:00:00Z", ["2026-09-19"]);
    expect(run([newer, tie]).find((e) => e.period === "2026-09-19")!.versionId).toBe(tie.id);
  });
  it("keeps a period a newer answer omits", () => expect(run([older, v(2, "2026-09-25T12:00:00Z", ["2026-09-18"])]).map((e) => e.period)).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]));
  it("uses a reprocessing from its recording on, leaving manifests fixed before it unchanged", () => {
    const fixed = v(4, older.acquiredAt, ["2026-09-16", "2026-09-17"], {acquisitionId: older.acquisitionId, recordedAt: "2026-10-10T12:00:00.000002Z", supersedes: older.id});
    const before = run([older, fixed], {knowledgeAt: "2026-10-10T12:00:00.000001Z"});
    const after = run([older, fixed], {knowledgeAt: "2026-10-10T12:00:00.000002Z"});
    expect(before.every((e) => e.versionId === older.id)).toBe(true);
    expect(after.map((e) => e.versionId)).toEqual([fixed.id, fixed.id]);
    const m = (entries: typeof before, k: string) => manifestSha256({logicalId: "market:bcb:sgs:0000000000000000", dataBase: "2026-09-30", knowledgeAt: k, window: {start: "2026-09-01", end: "2026-09-30"}, entries});
    expect(m(run([older, fixed], {knowledgeAt: "2026-10-10T12:00:00.000001Z"}), "2026-10-10T12:00:00.000001Z")).toBe(m(before, "2026-10-10T12:00:00.000001Z"));
    expect(m(before, "2026-10-10T12:00:00.000001Z")).not.toBe(m(before, "2026-10-10T12:00:00.000000Z"));
  });
  it.each([
    ["a reprocessing recorded at the same instant as its predecessor", () => [older, v(4, older.acquiredAt, [], {acquisitionId: older.acquisitionId, recordedAt: older.recordedAt, supersedes: older.id})], "market_reprocess_not_after_predecessor"],
    ["an unknown predecessor", () => [v(4, older.acquiredAt, [], {acquisitionId: older.acquisitionId, recordedAt: "2026-10-10T00:00:00Z", supersedes: id("00", 7)})], "market_reprocess_unknown_predecessor"],
    ["another acquisition", () => [older, newer, v(4, newer.acquiredAt, [], {acquisitionId: newer.acquisitionId, recordedAt: "2026-10-10T00:00:00Z", supersedes: older.id})], "market_reprocess_other_acquisition"],
    ["a changed acquisition instant", () => [older, v(4, "2026-09-20T12:00:00.000001Z", [], {acquisitionId: older.acquisitionId, recordedAt: "2026-10-10T00:00:00Z", supersedes: older.id})], "market_acquisition_instant_changed"],
    ["a version recorded before its acquisition", () => [v(1, "2026-09-20T12:00:00Z", ["2026-09-16"], {recordedAt: "2026-09-19T12:00:00Z"})], "market_version_recorded_before_acquisition"],
    ["two reprocessings of the same version", () => [older, v(4, older.acquiredAt, [], {acquisitionId: older.acquisitionId, recordedAt: "2026-10-10T00:00:00Z", supersedes: older.id}), v(5, older.acquiredAt, [], {acquisitionId: older.acquisitionId, recordedAt: "2026-10-11T00:00:00Z", supersedes: older.id})], "market_reprocess_forked"],
  ])("refuses a history with %s", (_, versions, code) => expect(() => run(versions())).toThrow(code));
  it("removes an officially withdrawn period without bringing back the older value, until a later acquisition carries it again", () => {
    expect(run([older, newer], {revocations: [revocation()]}).map((e) => e.period)).toEqual(["2026-09-16", "2026-09-18", "2026-09-19"]);
    const again = v(5, "2026-09-28T12:00:00Z", ["2026-09-17"]);
    expect(run([older, newer, again], {revocations: [revocation()]}).find((e) => e.period === "2026-09-17")!.versionId).toBe(again.id);
    expect(() => run([older], {revocations: [revocation({evidenceSha256: ""})]})).toThrow("market_revocation_invalid");
    expect(() => run([older], {revocations: [revocation(), revocation()]})).toThrow("market_revocation_invalid");
    expect(() => run([older], {revocations: [revocation({recordedAt: "2026-09-25T12:00:00Z"})]})).toThrow("market_revocation_recorded_before_acquisition");
  });
  it("filters by data-base and by right before choosing", () => {
    expect(run([older, newer], {dataBase: "2026-09-24"}).every((e) => e.versionId === older.id)).toBe(true);
    expect(run([older, newer], {allowed: (x) => x.id !== newer.id}).map((e) => e.versionId)).toEqual([older.id, older.id, older.id]);
  });
});
