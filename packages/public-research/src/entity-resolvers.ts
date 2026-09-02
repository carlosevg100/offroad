import {parse} from "csv-parse/sync";
import {z} from "zod";
import type {PublicResearchSubject} from "./contracts";
import {debtJurisdictionSchema, type DebtJurisdiction} from "./source-registry";

// Kept local to avoid an index -> resolver -> index runtime cycle. The public package schema is
// deliberately equivalent and remains the exported contract consumed by callers.
const officialEntitySubjectSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  website: z.url().optional(),
  sector: z.string().trim().min(2).max(120).optional(),
  geography: z.string().trim().min(2).max(80).optional(),
});

export const officialEntityCandidateSchema = z.object({
  jurisdiction: debtJurisdictionSchema,
  sourceId: z.enum(["cvm_open_data", "sec_edgar"]),
  officialIdentifier: z.string().min(1).max(80),
  legalName: z.string().min(2).max(300),
  tradingName: z.string().max(300).nullable(),
  ticker: z.string().max(30).nullable(),
  sector: z.string().max(200).nullable(),
  status: z.string().max(160).nullable(),
  sourceUrl: z.url(),
  retrievedAt: z.iso.datetime(),
  matchScore: z.number().min(0).max(1),
});
export type OfficialEntityCandidate = z.infer<typeof officialEntityCandidateSchema>;

export const officialEntityResolutionSchema = z.object({
  status: z.enum(["resolved", "ambiguous", "not_found"]),
  jurisdiction: debtJurisdictionSchema,
  queryName: z.string().min(2),
  selected: officialEntityCandidateSchema.nullable(),
  candidates: z.array(officialEntityCandidateSchema).max(5),
  retrievedAt: z.iso.datetime(),
});
export type OfficialEntityResolution = z.infer<typeof officialEntityResolutionSchema>;

export type OfficialEntityResolver = {
  readonly jurisdiction: DebtJurisdiction;
  resolve(subject: PublicResearchSubject): Promise<OfficialEntityCandidate[]>;
};

const CVM_CADASTRO_URL = "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv";
const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

type CvmRow = {
  CNPJ_CIA?: string;
  DENOM_SOCIAL?: string;
  DENOM_COMERC?: string;
  CD_CVM?: string;
  SETOR_ATIV?: string;
  SIT?: string;
  SIT_EMISSOR?: string;
};

export function createCvmOpenDataEntityResolver(input: {
  fetch?: typeof fetch;
  now?: () => Date;
  cadastroUrl?: string;
} = {}): OfficialEntityResolver {
  const request = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const cadastroUrl = input.cadastroUrl ?? CVM_CADASTRO_URL;
  let rowsPromise: Promise<CvmRow[]> | undefined;
  const loadRows = () => rowsPromise ??= (async () => {
    const response = await request(cadastroUrl, {headers: {Accept: "text/csv,application/octet-stream"}});
    if (!response.ok) throw codedError(`cvm_registry_http_${response.status}`);
    const text = new TextDecoder("windows-1252").decode(await response.arrayBuffer());
    return parse(text, {
      bom: true,
      columns: true,
      delimiter: ";",
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as CvmRow[];
  })();
  return {
    jurisdiction: "BR",
    async resolve(rawSubject) {
      const subject = officialEntitySubjectSchema.parse(rawSubject);
      const rows = await loadRows();
      const retrievedAt = now().toISOString();
      return rows.flatMap((row) => {
        const legalName = clean(row.DENOM_SOCIAL);
        const tradingName = clean(row.DENOM_COMERC);
        const officialIdentifier = clean(row.CD_CVM);
        if (!legalName || !officialIdentifier) return [];
        const matchScore = Math.max(nameScore(subject.legalName, legalName), nameScore(subject.legalName, tradingName));
        if (matchScore < 0.45) return [];
        const status = clean(row.SIT_EMISSOR) || clean(row.SIT) || null;
        const activeBoost = /normal|ativo/i.test(status ?? "") ? 0.03 : 0;
        return [officialEntityCandidateSchema.parse({
          jurisdiction: "BR",
          sourceId: "cvm_open_data",
          officialIdentifier,
          legalName,
          tradingName: tradingName || null,
          ticker: null,
          sector: clean(row.SETOR_ATIV) || null,
          status,
          sourceUrl: cadastroUrl,
          retrievedAt,
          matchScore: Math.min(1, matchScore + activeBoost),
        })];
      }).sort(compareCandidates).slice(0, 5);
    },
  };
}

const secTickerEntrySchema = z.object({
  cik_str: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  ticker: z.string().min(1).max(30),
  title: z.string().min(2).max(300),
});

export function createSecEdgarEntityResolver(input: {
  userAgent: string;
  fetch?: typeof fetch;
  now?: () => Date;
  tickersUrl?: string;
}): OfficialEntityResolver {
  const request = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  const tickersUrl = input.tickersUrl ?? SEC_TICKERS_URL;
  const userAgent = z.string().trim().min(10).max(300).parse(input.userAgent);
  let tickersPromise: Promise<Record<string, z.infer<typeof secTickerEntrySchema>>> | undefined;
  const loadTickers = () => tickersPromise ??= (async () => {
    const response = await request(tickersUrl, {headers: {Accept: "application/json", "User-Agent": userAgent}});
    if (!response.ok) throw codedError(`sec_registry_http_${response.status}`);
    return z.record(z.string(), secTickerEntrySchema).parse(await response.json());
  })();
  return {
    jurisdiction: "US",
    async resolve(rawSubject) {
      const subject = officialEntitySubjectSchema.parse(rawSubject);
      const payload = await loadTickers();
      const retrievedAt = now().toISOString();
      return Object.values(payload).flatMap((entry) => {
        const matchScore = Math.max(
          nameScore(subject.legalName, entry.title),
          normalizeName(subject.legalName) === normalizeName(entry.ticker) ? 1 : 0,
        );
        if (matchScore < 0.45) return [];
        const cik = String(entry.cik_str).padStart(10, "0");
        return [officialEntityCandidateSchema.parse({
          jurisdiction: "US",
          sourceId: "sec_edgar",
          officialIdentifier: `CIK:${cik}`,
          legalName: entry.title,
          tradingName: null,
          ticker: entry.ticker.toUpperCase(),
          sector: null,
          status: "SEC registrant",
          sourceUrl: tickersUrl,
          retrievedAt,
          matchScore,
        })];
      }).sort(compareCandidates).slice(0, 5);
    },
  };
}

export async function resolveOfficialEntity(input: {
  jurisdiction: Exclude<DebtJurisdiction, "GLOBAL">;
  subject: PublicResearchSubject;
  resolvers: readonly OfficialEntityResolver[];
}): Promise<OfficialEntityResolution> {
  const jurisdiction = debtJurisdictionSchema.exclude(["GLOBAL"]).parse(input.jurisdiction);
  const subject = officialEntitySubjectSchema.parse(input.subject);
  const resolver = input.resolvers.find((candidate) => candidate.jurisdiction === jurisdiction);
  const retrievedAt = new Date().toISOString();
  if (!resolver) return officialEntityResolutionSchema.parse({
    status: "not_found", jurisdiction, queryName: subject.legalName,
    selected: null, candidates: [], retrievedAt,
  });
  const candidates = (await resolver.resolve(subject)).slice(0, 5);
  const first = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  const resolved = first && first.matchScore >= 0.72
    && (!second || first.matchScore - second.matchScore >= 0.08);
  return officialEntityResolutionSchema.parse({
    status: resolved ? "resolved" : candidates.length > 0 ? "ambiguous" : "not_found",
    jurisdiction,
    queryName: subject.legalName,
    selected: resolved ? first : null,
    candidates,
    retrievedAt: first?.retrievedAt ?? retrievedAt,
  });
}

function compareCandidates(left: OfficialEntityCandidate, right: OfficialEntityCandidate): number {
  return right.matchScore - left.matchScore || left.legalName.localeCompare(right.legalName);
}

function nameScore(query: string, candidate: string): number {
  const left = normalizeName(query);
  const right = normalizeName(candidate);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length >= 4 && (left.includes(right) || right.includes(left))) return 0.88;
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 1));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(s\.?a\.?|ltda|inc\.?|corp\.?|corporation|company|co\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function codedError(code: string): Error & {code: string} {
  return Object.assign(new Error(code), {code});
}
