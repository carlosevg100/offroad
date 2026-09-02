import {createHash} from "node:crypto";
import JSZip from "jszip";
import {parse} from "csv-parse/sync";
import {z} from "zod";

import type {
  PublicResearchSubject,
  PublicSearchProvider,
  ResearchSource,
  ResearchTopic,
} from "./contracts";
import {
  resolveOfficialEntity,
  type OfficialEntityCandidate,
  type OfficialEntityResolver,
} from "./entity-resolvers";

type OfficialSnapshot = {
  sources: ResearchSource[];
};

const secSubmissionsSchema = z.object({
  name: z.string().min(1),
  cik: z.union([z.string(), z.number()]),
  tickers: z.array(z.string()).default([]),
  exchanges: z.array(z.string()).default([]),
  sic: z.string().nullish(),
  sicDescription: z.string().nullish(),
  filings: z.object({
    recent: z.object({
      accessionNumber: z.array(z.string()).default([]),
      filingDate: z.array(z.string()).default([]),
      reportDate: z.array(z.string()).default([]),
      form: z.array(z.string()).default([]),
      primaryDocument: z.array(z.string()).default([]),
      primaryDocDescription: z.array(z.string()).default([]),
    }),
  }),
});

const secFactUnitSchema = z.object({
  val: z.number(),
  accn: z.string().optional(),
  fy: z.number().nullish(),
  fp: z.string().nullish(),
  form: z.string().nullish(),
  filed: z.string().nullish(),
  frame: z.string().nullish(),
  start: z.string().nullish(),
  end: z.string().nullish(),
});
const secCompanyFactsSchema = z.object({
  entityName: z.string().min(1),
  facts: z.record(z.string(), z.record(z.string(), z.object({
    label: z.string().default(""),
    description: z.string().default(""),
    units: z.record(z.string(), z.array(secFactUnitSchema)).default({}),
  }))).default({}),
});

type CvmStatementRow = {
  CD_CVM?: string;
  DT_REFER?: string;
  VERSAO?: string;
  DENOM_CIA?: string;
  GRUPO_DFP?: string;
  MOEDA?: string;
  ESCALA_MOEDA?: string;
  ORDEM_EXERC?: string;
  DT_FIM_EXERC?: string;
  CD_CONTA?: string;
  DS_CONTA?: string;
  VL_CONTA?: string;
  ST_CONTA_FIXA?: string;
};

const relevantCvmAccounts = [
  /^1$/, /^1\.01$/, /^1\.01\.01/, /^1\.02$/,
  /^2$/, /^2\.01$/, /^2\.01\.04/, /^2\.02$/, /^2\.02\.01/, /^2\.03$/,
  /^3\.01$/, /^3\.03$/, /^3\.05$/, /^3\.11$/,
  /^6\.01$/, /^6\.02$/, /^6\.03$/, /^6\.05$/,
];

const relevantSecTags = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "OperatingIncomeLoss",
  "NetIncomeLoss",
  "Assets",
  "Liabilities",
  "StockholdersEquity",
  "CashAndCashEquivalentsAtCarryingValue",
  "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  "ShortTermBorrowings",
  "LongTermDebtCurrent",
  "LongTermDebtNoncurrent",
  "LongTermDebt",
  "OperatingCashFlow",
  "NetCashProvidedByUsedInOperatingActivities",
] as const;

/**
 * Creates a zero-model, zero-paid-search provider for one public company. Entity resolution is
 * deliberately strict and memoized. Official facts are additive (`continueAfterSuccess`): a
 * regulator answer never prevents complementary discovery, but discovery cannot replace it.
 */
export function createOfficialCompanyResearchProvider(input: {
  jurisdiction: "BR" | "US";
  subject: PublicResearchSubject;
  resolvers: readonly OfficialEntityResolver[];
  userAgent: string;
  fetch?: typeof fetch;
  now?: () => Date;
  cvmAnnualYears?: readonly number[];
  cvmInterimYears?: readonly number[];
}): PublicSearchProvider {
  const request = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const userAgent = z.string().trim().min(10).max(300).parse(input.userAgent);
  let snapshot: Promise<OfficialSnapshot> | undefined;

  const load = () => snapshot ??= (async () => {
    const resolution = await resolveOfficialEntity({
      jurisdiction: input.jurisdiction,
      subject: input.subject,
      resolvers: input.resolvers,
    });
    if (resolution.status === "ambiguous") throw codedError("official_entity_ambiguous");
    if (resolution.status !== "resolved" || !resolution.selected) {
      throw codedError("official_entity_not_found");
    }
    return input.jurisdiction === "US"
      ? loadSecSnapshot({candidate: resolution.selected, request, userAgent, now})
      : loadCvmSnapshot({
          candidate: resolution.selected,
          request,
          now,
          annualYears: input.cvmAnnualYears ?? defaultAnnualYears(now()),
          interimYears: input.cvmInterimYears ?? defaultInterimYears(now()),
        });
  })();

  return {
    id: "official",
    maxCostUsdPerCall: 0,
    continueAfterSuccess: true,
    async search(query) {
      const official = await load();
      return official.sources.filter((source) => sourceAppliesToTopic(source.topic, query.topic, query.query));
    },
  };
}

async function loadSecSnapshot(input: {
  candidate: OfficialEntityCandidate;
  request: typeof fetch;
  userAgent: string;
  now: () => Date;
}): Promise<OfficialSnapshot> {
  const cik = input.candidate.officialIdentifier.replace(/^CIK:/, "").padStart(10, "0");
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const headers = {Accept: "application/json", "User-Agent": input.userAgent};
  const [submissionsResponse, factsResponse] = await Promise.all([
    input.request(submissionsUrl, {headers}),
    input.request(factsUrl, {headers}),
  ]);
  if (!submissionsResponse.ok) throw codedError(`sec_submissions_http_${submissionsResponse.status}`);
  if (!factsResponse.ok) throw codedError(`sec_companyfacts_http_${factsResponse.status}`);
  const submissions = secSubmissionsSchema.parse(await submissionsResponse.json());
  const facts = secCompanyFactsSchema.parse(await factsResponse.json());
  const retrievedAt = input.now().toISOString();
  const filings = recentSecFilings(submissions, cik);
  const factLines = selectSecFacts(facts);
  return {
    sources: [
      researchSource({
        topic: "identity",
        title: `SEC registrant identity: ${submissions.name}`,
        url: input.candidate.sourceUrl,
        snippet: [
          `Official entity: ${submissions.name}`,
          `CIK: ${cik}`,
          `Tickers: ${submissions.tickers.join(", ") || "not disclosed"}`,
          `Exchanges: ${submissions.exchanges.join(", ") || "not disclosed"}`,
          `SIC: ${submissions.sic ?? "not disclosed"}; ${submissions.sicDescription ?? "not disclosed"}`,
        ].join("\n"),
        publishedAt: null,
        retrievedAt,
      }),
      researchSource({
        topic: "market",
        title: `SEC recent filings: ${submissions.name}`,
        url: submissionsUrl,
        snippet: filings.map((filing) => [
          filing.form,
          `filed ${filing.filingDate}`,
          filing.reportDate ? `period ${filing.reportDate}` : null,
          filing.description || null,
          filing.url,
        ].filter(Boolean).join(" | ")).join("\n"),
        publishedAt: filings[0]?.filingDate ?? null,
        retrievedAt,
      }),
      researchSource({
        topic: "identity",
        title: `SEC structured company facts: ${facts.entityName}`,
        url: factsUrl,
        snippet: factLines.join("\n"),
        publishedAt: latestDate(factLines.map((line) => line.match(/filed=([^ |]+)/)?.[1] ?? null)),
        retrievedAt,
      }),
    ],
  };
}

async function loadCvmSnapshot(input: {
  candidate: OfficialEntityCandidate;
  request: typeof fetch;
  now: () => Date;
  annualYears: readonly number[];
  interimYears: readonly number[];
}): Promise<OfficialSnapshot> {
  const retrievedAt = input.now().toISOString();
  const sourceAttempts = [
    ...input.annualYears.map((year) => ({kind: "DFP" as const, year, url: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_${year}.zip`})),
    ...input.interimYears.map((year) => ({kind: "ITR" as const, year, url: `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year}.zip`})),
  ];
  const loaded = await Promise.all(sourceAttempts.map(async (attempt) => {
    const response = await input.request(attempt.url, {headers: {Accept: "application/zip,application/octet-stream"}});
    if (response.status === 404) return null;
    if (!response.ok) throw codedError(`cvm_${attempt.kind.toLowerCase()}_http_${response.status}`);
    const rows = await extractCvmStatementRows(new Uint8Array(await response.arrayBuffer()), input.candidate.officialIdentifier);
    if (rows.length === 0) return null;
    return {attempt, rows};
  }));
  const statementSources = loaded.flatMap((entry) => {
    if (!entry) return [];
    const latestReference = latestDate(entry.rows.map((row) => row.DT_REFER ?? null));
    return [researchSource({
      topic: "identity",
      title: `CVM ${entry.attempt.kind} structured statements ${entry.attempt.year}: ${input.candidate.legalName}`,
      url: entry.attempt.url,
      snippet: summarizeCvmRows(entry.rows),
      publishedAt: latestReference,
      retrievedAt,
    })];
  });
  return {
    sources: [
      researchSource({
        topic: "identity",
        title: `CVM issuer registry: ${input.candidate.legalName}`,
        url: input.candidate.sourceUrl,
        snippet: [
          `Official entity: ${input.candidate.legalName}`,
          `Trading name: ${input.candidate.tradingName ?? "not disclosed"}`,
          `CVM code: ${input.candidate.officialIdentifier}`,
          `Sector: ${input.candidate.sector ?? "not disclosed"}`,
          `Issuer status: ${input.candidate.status ?? "not disclosed"}`,
        ].join("\n"),
        publishedAt: null,
        retrievedAt,
      }),
      ...statementSources,
    ],
  };
}

async function extractCvmStatementRows(bytes: Uint8Array, cvmCode: string): Promise<CvmStatementRow[]> {
  const zip = await JSZip.loadAsync(bytes, {checkCRC32: true});
  const statementFiles = Object.values(zip.files).filter((file) =>
    !file.dir && /_(?:BPA|BPP|DRE|DFC_MI|DFC_MD)_con_\d{4}\.csv$/i.test(file.name),
  );
  const normalizedCode = normalizeNumericIdentifier(cvmCode);
  const results: CvmStatementRow[] = [];
  for (const file of statementFiles) {
    const buffer = await file.async("uint8array");
    const text = new TextDecoder("windows-1252").decode(buffer);
    const rows = parse(text, {
      bom: true,
      columns: true,
      delimiter: ";",
      skip_empty_lines: true,
      relax_column_count: true,
      // Some CVM statement archives contain literal quotes in otherwise unquoted descriptions.
      // Preserve the row instead of turning one malformed description into a provider-wide
      // failure shared by every research topic in the run.
      relax_quotes: true,
      trim: true,
    }) as CvmStatementRow[];
    const matching = rows.filter((row) =>
      normalizeNumericIdentifier(row.CD_CVM ?? "") === normalizedCode
      && relevantCvmAccounts.some((pattern) => pattern.test(row.CD_CONTA ?? "")),
    );
    const latestReference = latestDate(matching.map((row) => row.DT_REFER ?? null));
    const latestVersion = Math.max(...matching
      .filter((row) => !latestReference || row.DT_REFER === latestReference)
      .map((row) => Number(row.VERSAO ?? 0)), 0);
    results.push(...matching.filter((row) =>
      (!latestReference || row.DT_REFER === latestReference)
      && Number(row.VERSAO ?? 0) === latestVersion
      && (!row.ORDEM_EXERC || /^(?:ULTIMO|LAST)$/.test(normalizeLabel(row.ORDEM_EXERC))),
    ));
  }
  return results;
}

function summarizeCvmRows(rows: CvmStatementRow[]): string {
  const ordered = [...rows].sort((left, right) =>
    String(left.DT_REFER).localeCompare(String(right.DT_REFER))
    || String(left.CD_CONTA).localeCompare(String(right.CD_CONTA)),
  );
  const header = ordered[0]
    ? `Company=${ordered[0].DENOM_CIA ?? ""} | reference=${ordered[0].DT_REFER ?? ""} | currency=${ordered[0].MOEDA ?? ""} | scale=${ordered[0].ESCALA_MOEDA ?? ""}`
    : "";
  const metrics = summarizeCvmKeyMetrics(ordered);
  const lines = ordered.map((row) => [
    row.DT_REFER,
    row.CD_CONTA,
    row.DS_CONTA,
    `value=${formatCvmValue(row)}`,
    row.DT_FIM_EXERC ? `period_end=${row.DT_FIM_EXERC}` : null,
  ].filter(Boolean).join(" | "));
  return [header, metrics, ...lines].filter(Boolean).join("\n").slice(0, 8_000);
}

function summarizeCvmKeyMetrics(rows: CvmStatementRow[]): string {
  const byCode = new Map(rows.map((row) => [row.CD_CONTA ?? "", row]));
  const definitions = [
    ["cash", "1.01.01"],
    ["short_term_debt", "2.01.04"],
    ["long_term_debt", "2.02.01"],
    ["revenue", "3.01"],
    ["ebit", "3.05"],
    ["net_income", "3.11"],
    ["operating_cash_flow", "6.01"],
  ] as const;
  const facts = definitions.flatMap(([label, code]) => {
    const row = byCode.get(code);
    return row ? [`${label}=${formatCvmValue(row)}`] : [];
  });
  const cash = numericCvmValue(byCode.get("1.01.01"));
  const shortDebt = numericCvmValue(byCode.get("2.01.04"));
  const longDebt = numericCvmValue(byCode.get("2.02.01"));
  const unitRow = byCode.get("2.01.04") ?? byCode.get("2.02.01") ?? byCode.get("1.01.01");
  if (unitRow && shortDebt !== null && longDebt !== null) {
    const grossDebt = shortDebt + longDebt;
    facts.splice(3, 0, `gross_debt=${formatCvmNumericValue(grossDebt, unitRow)}`);
    if (cash !== null) facts.splice(4, 0, `net_debt=${formatCvmNumericValue(grossDebt - cash, unitRow)}`);
  }
  const period = rows[0]?.DT_FIM_EXERC ?? rows[0]?.DT_REFER ?? "not disclosed";
  return facts.length > 0
    ? `Key metrics (consolidated; source scale normalized) | period_end=${period} | ${facts.join(" | ")}`
    : "";
}

function numericCvmValue(row: CvmStatementRow | undefined): number | null {
  if (!row?.VL_CONTA) return null;
  const value = Number(row.VL_CONTA.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function formatCvmValue(row: CvmStatementRow): string {
  const value = numericCvmValue(row);
  return value === null ? `${row.VL_CONTA ?? "not disclosed"} ${row.ESCALA_MOEDA ?? ""}`.trim()
    : formatCvmNumericValue(value, row);
}

function formatCvmNumericValue(value: number, row: CvmStatementRow): string {
  if (normalizeLabel(row.MOEDA ?? "") === "REAL" && normalizeLabel(row.ESCALA_MOEDA ?? "") === "MIL") {
    return `BRL ${new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 0, maximumFractionDigits: 3}).format(value / 1_000)} milhões`;
  }
  const normalized = new Intl.NumberFormat("en-US", {useGrouping: false, maximumFractionDigits: 10}).format(value);
  return `${row.MOEDA ?? "currency not disclosed"} ${normalized} ${row.ESCALA_MOEDA ?? "scale not disclosed"}`;
}

function normalizeLabel(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function recentSecFilings(submissions: z.infer<typeof secSubmissionsSchema>, cik: string) {
  const recent = submissions.filings.recent;
  const acceptedForms = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A"]);
  const result = [] as Array<{
    form: string; filingDate: string; reportDate: string; description: string; url: string;
  }>;
  for (let index = 0; index < recent.form.length && result.length < 16; index += 1) {
    const form = recent.form[index] ?? "";
    const accession = recent.accessionNumber[index] ?? "";
    const primaryDocument = recent.primaryDocument[index] ?? "";
    if (!acceptedForms.has(form) || !accession || !primaryDocument) continue;
    const accessionPath = accession.replace(/-/g, "");
    result.push({
      form,
      filingDate: recent.filingDate[index] ?? "",
      reportDate: recent.reportDate[index] ?? "",
      description: recent.primaryDocDescription[index] ?? "",
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${primaryDocument}`,
    });
  }
  return result;
}

function selectSecFacts(payload: z.infer<typeof secCompanyFactsSchema>): string[] {
  const gaap = payload.facts["us-gaap"] ?? {};
  const lines: string[] = [];
  for (const tag of relevantSecTags) {
    const fact = gaap[tag];
    if (!fact) continue;
    for (const [unit, observations] of Object.entries(fact.units)) {
      const selected = [...observations]
        .filter((item) => item.form === "10-K" || item.form === "10-Q")
        .sort((left, right) => String(right.filed).localeCompare(String(left.filed)))
        .slice(0, 4);
      for (const item of selected) {
        lines.push([
          `${tag} (${fact.label || tag})`,
          `value=${item.val}`,
          `unit=${unit}`,
          item.end ? `period_end=${item.end}` : null,
          item.filed ? `filed=${item.filed}` : null,
          item.form ? `form=${item.form}` : null,
          item.accn ? `accession=${item.accn}` : null,
        ].filter(Boolean).join(" | "));
      }
    }
  }
  return lines.slice(0, 100).join("\n").slice(0, 8_000).split("\n").filter(Boolean);
}

function sourceAppliesToTopic(sourceTopic: ResearchTopic, queryTopic: ResearchTopic, queryText: string): boolean {
  if (sourceTopic === queryTopic) return true;
  if (sourceTopic === "identity" && queryTopic === "market" && /d[ií]vida|debt|financial|endividamento|liquidez/i.test(queryText)) return true;
  if (sourceTopic === "market" && queryTopic === "identity" && /resultado|financial|endividamento|debt|demonstra/i.test(queryText)) return true;
  if (sourceTopic === "market" && queryTopic === "news") return true;
  return false;
}

function researchSource(input: Omit<ResearchSource, "provider" | "contentHash">): ResearchSource {
  return {
    provider: "official",
    ...input,
    snippet: input.snippet.slice(0, 8_000),
    contentHash: sha256(`${canonicalUrl(input.url)}\n${input.snippet.slice(0, 8_000)}`),
  };
}

function defaultAnnualYears(now: Date): number[] {
  return [now.getUTCFullYear() - 1, now.getUTCFullYear() - 2];
}

function defaultInterimYears(now: Date): number[] {
  return [now.getUTCFullYear(), now.getUTCFullYear() - 1];
}

function latestDate(values: Array<string | null>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function normalizeNumericIdentifier(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "") || "0";
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codedError(code: string): Error & {code: string} {
  return Object.assign(new Error(code), {code});
}
