import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {availableForDataBase, dataBaseLimit} from "./market-availability";
import {canonicalSha256V2, canonicalTextV2, type CanonicalV2Input} from "./market-canonical-v2";
import {manifestSha256, selectPeriods, type SelectableVersion} from "./market-period-selection";
import {
  checkCommuniqueUrl, checkSelicTargetUrl, communiqueRecordSha256, communiqueUrl, parseCommuniqueDetail, parseCommuniqueList,
  parseSelicTarget, selicTargetContractSha256, selicTargetUrl,
} from "./selic-target-contract";
import {evaluateSelicTarget, type AcquiredCommunique} from "./selic-target-quality";

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

describe("canonical v2 binds every new field", () => {
  const base = vectors.canonicalV2[0]!.input;
  const tampered: [string, (x: CanonicalV2Input) => CanonicalV2Input][] = [
    ["source revision", (x) => ({...x, sourceRevisionId: "6f1c2a40-8d3e-4b7a-9c11-2e5f8a9b0c02"})],
    ["series contract", (x) => ({...x, seriesContract: {...x.seriesContract, sha256: "0".repeat(64)}})],
    ["parser", (x) => ({...x, parser: "bcb-sgs-daily-json.v2"})],
    ["quality policy", (x) => ({...x, qualityPolicy: {...x.qualityPolicy, version: "v2"}})],
    ["supersedes", (x) => ({...x, supersedes: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f"})],
    ["link meeting", (x) => ({...x, links: [{...x.links[0]!, meeting: 280}]})],
    ["link date", (x) => ({...x, links: [{...x.links[0]!, referenceDate: "2026-09-17"}]})],
    ["link decision", (x) => ({...x, links: [{...x.links[0]!, decision: "hold"}]})],
    ["link value", (x) => ({...x, links: [{...x.links[0]!, targetPct: "13.5"}]})],
    ["link record", (x) => ({...x, links: [{...x.links[0]!, recordSha256: "f".repeat(64)}]})],
    ["link acquisition", (x) => ({...x, links: [{...x.links[0]!, acquisitionId: "9e2b4c61-7d8a-4f3e-a5b9-1c2d3e4f5a69"}]})],
  ];
  it.each(tampered)("%s, with the same dates and values", (_, mutate) => expect(canonicalSha256V2(mutate(base))).not.toBe(canonicalSha256V2(base)));
});

describe("closed URLs", () => {
  it("builds the only series URL and accepts it back", () => {
    const url = selicTargetUrl(window);
    expect(url).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026");
    expect(checkSelicTargetUrl(url, window)).toBe(true);
  });
  it.each([
    ["the CDI, series 12, on the same host", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_series"],
    ["the CDI, series 4389", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_series"],
    ["a trailing slash", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_series"],
    ["another window", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=01/09/2026&dataFinal=20/09/2026", "market_url_parameters"],
    ["a repeated parameter", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_parameters"],
    ["csv", "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=csv&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_parameters"],
    ["another host", "https://www.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_host"],
    ["plain http", "http://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_not_allowed"],
    ["a port", "https://api.bcb.gov.br:8443/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=14/09/2026&dataFinal=20/09/2026", "market_url_not_allowed"],
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
    expect(() => communiqueUrl({kind: "list", size: 101})).toThrow("market_communique_list_size");
  });
});

describe("SGS 432 parser", () => {
  const row = (d: string, v: string) => ({data: d, valor: v});
  it("reads the daily answer", () => expect(parseSelicTarget(bytes([row("16/09/2026", "14.00"), row("17/09/2026", "13.75")]), window))
    .toEqual([{period: "2026-09-16", value: "14.00"}, {period: "2026-09-17", value: "13.75"}]));
  it.each([
    ["the HTML error page a browser agent receives with status 200", "<?xml version=\"1.0\"?><html><title>Requisição inválida!</title></html>", "market_parse_not_json"],
    ["an empty answer", [], "market_parse_empty"],
    ["a repeated day", [row("16/09/2026", "14.00"), row("16/09/2026", "14.00")], "market_parse_duplicate_period"],
    ["unordered days", [row("17/09/2026", "13.75"), row("16/09/2026", "14.00")], "market_parse_unordered"],
    ["a day outside the window", [row("21/09/2026", "13.75")], "market_parse_outside_window"],
    ["an extra field", [{...row("16/09/2026", "14.00"), fonte: "x"}], "market_parse_row"],
    ["a value with a comma", [row("16/09/2026", "14,00")], "market_parse_value"],
    ["an impossible date", [row("31/09/2026", "14.00")], "market_parse_date"],
    ["an object instead of an array", {dados: []}, "market_parse_not_array"],
  ])("fails the attempt on %s", (_, body, code) => expect(() => parseSelicTarget(bytes(body), window)).toThrow(code));
});

describe("communiqué parser", () => {
  const record = {nro_reuniao: 281, dataReferencia: "2026-09-16", titulo: "281ª reunião - Copom reduz a taxa Selic para  13,75% a.a.",
    textoComunicado: "<p>Texto sintético de teste. O Comitê decidiu reduzir a taxa básica de juros para 13,75%&nbsp;a.a. Projeções de 4,50% a.a. não são a decisão.</p>"};
  it("reads value, decision and the day the series changes", () => {
    const c = parseCommuniqueDetail(bytes({conteudo: [record]}), 281);
    expect(c).toEqual({meeting: 281, referenceDate: "2026-09-16", decision: "cut", targetPct: "13.75", recordSha256: communiqueRecordSha256(record), seriesChangeDate: "2026-09-17"});
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
    ["a title without a decision verb", {conteudo: [{...record, titulo: "Copom: taxa Selic em 13,75% a.a."}]}, "market_parse_communique_title"],
    ["a text that does not state the rate", {conteudo: [{...record, textoComunicado: "<p>O Comitê decidiu reduzir a taxa para 13,50% a.a.</p>"}]}, "market_parse_communique_text"],
    ["an impossible date", {conteudo: [{...record, dataReferencia: "2026-02-30"}]}, "market_parse_communique_date"],
  ])("refuses %s", (_, body, code) => expect(() => parseCommuniqueDetail(bytes(body), 281)).toThrow(code));
  it("reads the list only to discover meetings, in decreasing order", () => {
    const list = {conteudo: [{nro_reuniao: 281, dataReferencia: "2026-09-16", titulo: "a"}, {nro_reuniao: 280, dataReferencia: "2026-08-05", titulo: "b"}]};
    expect(parseCommuniqueList(bytes(list), 5).map((m) => m.meeting)).toEqual([281, 280]);
    expect(() => parseCommuniqueList(bytes({conteudo: [...list.conteudo].reverse()}), 5)).toThrow("market_parse_communique_order");
    expect(() => parseCommuniqueList(bytes(list), 1)).toThrow("market_parse_communique_list_size");
  });
});

describe("quality and joint eligibility of series and communiqué", () => {
  const at = (local: string) => new Date(`${local}-03:00`).toISOString();
  const series = (acquiredAt: string) => [["2026-09-15", "14.00"], ["2026-09-16", "14.00"], ["2026-09-17", "13.75"], ["2026-09-18", "13.75"]]
    .map(([period, value]) => ({period: period!, value: value!, acquiredAt}));
  const c281 = (acquiredAt: string): AcquiredCommunique => ({meeting: 281, referenceDate: "2026-09-16", decision: "cut", targetPct: "13.75", recordSha256: "a".repeat(64), seriesChangeDate: "2026-09-17", acquiredAt});
  it("links the change when both were acquired the same day, up to the last millisecond", () => {
    const q = evaluateSelicTarget({observations: series(at("2026-09-18T10:00:00")), communiques: [c281(at("2026-09-18T23:59:59.999"))], dataBase: "2026-09-18"});
    expect(q.status).toBe("approved");
    expect(q.links).toEqual([{period: "2026-09-17", from: "14.00", to: "13.75", meeting: 281, recordSha256: "a".repeat(64)}]);
  });
  it("quarantines the change for D when the communiqué arrives exactly at the limit, and links it for D+1", () => {
    const input = {observations: series(at("2026-09-18T10:00:00")), communiques: [c281(at("2026-09-19T00:00:00"))]};
    expect(evaluateSelicTarget({...input, dataBase: "2026-09-18"}).findings).toEqual([{code: "change_without_communique", period: "2026-09-17", from: "14.00", to: "13.75"}]);
    expect(evaluateSelicTarget({...input, dataBase: "2026-09-19"}).status).toBe("approved");
  });
  it("follows the series on the calendar day after a meeting on the eve of a holiday (Finados 2023)", () => {
    const obs = [["2023-11-01", "12.75"], ["2023-11-02", "12.25"], ["2023-11-03", "12.25"]].map(([period, value]) => ({period: period!, value: value!, acquiredAt: at("2026-10-21T10:00:00")}));
    const c: AcquiredCommunique = {meeting: 258, referenceDate: "2023-11-01", decision: "cut", targetPct: "12.25", recordSha256: "b".repeat(64), seriesChangeDate: "2023-11-02", acquiredAt: at("2026-10-21T10:00:00")};
    expect(evaluateSelicTarget({observations: obs, communiques: [c], dataBase: "2026-10-21"}).status).toBe("approved");
  });
  it("finds a hold that the series contradicts, a gap and a value out of range", () => {
    const hold = {...c281(at("2026-09-18T10:00:00")), decision: "hold" as const};
    const q = evaluateSelicTarget({observations: series(at("2026-09-18T10:00:00")), communiques: [hold], dataBase: "2026-09-18"});
    expect(q.findings).toEqual([{code: "communique_direction_mismatch", period: "2026-09-17", meeting: 281}]);
    const gap = series(at("2026-09-18T10:00:00")).filter((o) => o.period !== "2026-09-16").map((o) => o.period === "2026-09-18" ? {...o, value: "100.25"} : o);
    expect(evaluateSelicTarget({observations: gap, communiques: [c281(at("2026-09-18T10:00:00"))], dataBase: "2026-09-18"}).findings.map((f) => f.code)).toEqual(["calendar_gap", "value_out_of_range", "change_without_communique"]);
  });
});

describe("per-period selection", () => {
  const v = (n: number, acquiredAt: string, periods: string[], extra: Partial<SelectableVersion> = {}): SelectableVersion =>
    ({id: `00000000-0000-4000-8000-00000000000${n}`, acquisitionId: `10000000-0000-4000-8000-00000000000${n}`, acquiredAt, recordedAt: acquiredAt, supersedes: null, periods, ...extra});
  const run = (versions: SelectableVersion[], extra: Partial<Parameters<typeof selectPeriods>[0]> = {}) =>
    selectPeriods({versions, revocations: [], dataBase: "2026-09-30", knowledgeAt: "2026-10-21T12:00:00Z", window: {start: "2026-09-01", end: "2026-09-30"}, allowed: () => true, ...extra});
  const older = v(1, "2026-09-20T12:00:00Z", ["2026-09-16", "2026-09-17", "2026-09-18"]);
  const newer = v(2, "2026-09-25T12:00:00Z", ["2026-09-17", "2026-09-18", "2026-09-19"]);
  it("takes the most recent acquisition per period, whatever order they were confirmed in", () => {
    const expected = [{period: "2026-09-16", versionId: older.id}, {period: "2026-09-17", versionId: newer.id}, {period: "2026-09-18", versionId: newer.id}, {period: "2026-09-19", versionId: newer.id}];
    expect(run([older, newer])).toEqual(expected);
    expect(run([newer, older])).toEqual(expected);
  });
  it("breaks a tie of acquisition instants by the greater version id", () => {
    const tie = v(3, "2026-09-25T12:00:00Z", ["2026-09-19"]);
    expect(run([newer, tie]).find((e) => e.period === "2026-09-19")!.versionId).toBe(tie.id);
  });
  it("keeps a period a newer answer omits", () => expect(run([older, v(2, "2026-09-25T12:00:00Z", ["2026-09-18"])]).map((e) => e.period)).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]));
  it("uses a reprocessing from its recording on, leaving manifests fixed before it unchanged", () => {
    const fixed = v(4, "2026-09-20T12:00:00Z", ["2026-09-16", "2026-09-17"], {acquisitionId: older.acquisitionId, recordedAt: "2026-10-10T12:00:00Z", supersedes: older.id});
    const before = run([older, fixed], {knowledgeAt: "2026-10-01T00:00:00Z"});
    const after = run([older, fixed]);
    expect(before.every((e) => e.versionId === older.id)).toBe(true);
    expect(after.map((e) => e.versionId)).toEqual([fixed.id, fixed.id]);
    const m = (entries: typeof before, k: string) => manifestSha256({logicalId: "market:bcb:sgs:0000000000000000", dataBase: "2026-09-30", knowledgeAt: k, window: {start: "2026-09-01", end: "2026-09-30"}, entries});
    expect(m(run([older, fixed], {knowledgeAt: "2026-10-01T00:00:00Z"}), "2026-10-01T00:00:00Z")).toBe(m(before, "2026-10-01T00:00:00Z"));
    expect(m(after, "2026-10-21T12:00:00Z")).not.toBe(m(before, "2026-10-01T00:00:00Z"));
    expect(() => run([older, {...fixed, acquisitionId: newer.acquisitionId}, newer])).toThrow("market_reprocess_other_acquisition");
  });
  it("removes an officially withdrawn period without bringing back the older value, until a later acquisition carries it again", () => {
    const revocations = [{period: "2026-09-17", acquiredAt: "2026-09-26T12:00:00Z", recordedAt: "2026-09-26T12:00:00Z", evidenceSha256: "c".repeat(64)}];
    expect(run([older, newer], {revocations}).map((e) => e.period)).toEqual(["2026-09-16", "2026-09-18", "2026-09-19"]);
    const again = v(5, "2026-09-28T12:00:00Z", ["2026-09-17"]);
    expect(run([older, newer, again], {revocations}).find((e) => e.period === "2026-09-17")!.versionId).toBe(again.id);
  });
  it("filters by data-base and by right before choosing", () => {
    expect(run([older, newer], {dataBase: "2026-09-24"}).every((e) => e.versionId === older.id)).toBe(true);
    expect(run([older, newer], {allowed: (x) => x.id !== newer.id}).map((e) => e.versionId)).toEqual([older.id, older.id, older.id]);
  });
});
