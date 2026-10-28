import {composeBoundBoardCapitalDiscussion} from "@offroad/financial-model";
import {readContextualBasis} from "@offroad/reconciliation";
import type {CapitalExecutionAsk} from "./compose";
import type {ExecutionContractBasis} from "./contract";

/** The board discussion (ficha C47, prepare-board-capital-discussion) reads reviewed results of other methods, each a
 * completed execution of the same work. The server returns them by role (the id the basis gives the result); the
 * request copies each stored result verbatim, names it by execution and packet fingerprint, and the database checks
 * every reference against its stored rows. */
export const boardMaterialMethodId = "prepare-board-capital-discussion";
/** The role of each source method: the id the basis names its result by. */
export const boardMaterialRoles = {
  "tabela-divida": "build-company-debt-table", covenant: "measure-covenant-headroom", "caixa-semanal": "project-weekly-cash",
  "linha-embalagem": "analyze-investment-project", projecao: "build-operating-projection", "plano-fpa": "challenge-financial-projection",
  recebiveis: "monetize-receivables-for-working-capital", "custo-relativo": "analyze-relative-debt-cost", "plano-2027": "evaluate-financing-paths",
} as const;
export type BoardMaterialRole = keyof typeof boardMaterialRoles;
/** One prior completed execution as the server returned it: its stored result (verbatim), the result fingerprint and
 * the sources its contract pinned. */
export type BoardMaterialPriorResult = {role: BoardMaterialRole; methodId: string; executionId: string; result: string; resultFingerprint: string; sources: ExecutionContractBasis["sources"]};
export type BoardMaterialPriorReference = {role: BoardMaterialRole; executionId: string; resultFingerprint: string};

const roleOf = new RegExp(`^board_capital\\.[0-9a-f-]{36}\\.source\\.([a-z0-9][a-z0-9-]{0,39})$`);
/** The results the basis names, by role, with the method and packet fingerprint each was adopted as. */
export function boardMaterialNamedSources(basis: Pick<ExecutionContractBasis, "envelope" | "workId" | "purpose" | "versionId">): {role: string; methodId: string; fingerprint: string}[] | null {
  try {
    const read = readContextualBasis(basis.envelope, {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId});
    return read.entries.flatMap((e) => {
      const m = roleOf.exec(e.fieldPath), v = e.value.value;
      return m && Array.isArray(v) && v.length === 2 ? [{role: m[1]!, methodId: String(v[0]), fingerprint: String(v[1])}] : [];
    });
  } catch { return null; }
}

/** The references the request carries: exactly the results the basis names, each one the latest completed execution the
 * server returned for its role with the same method and packet fingerprint. Anything else is null: the card was
 * proposed over other results and is superseded. */
export function boardMaterialPriorResults(basis: Pick<ExecutionContractBasis, "envelope" | "workId" | "purpose" | "versionId">, priors: readonly BoardMaterialPriorResult[]): BoardMaterialPriorReference[] | null {
  const named = boardMaterialNamedSources(basis);
  if (!named || !named.length || new Set(named.map((n) => n.role)).size !== named.length) return null;
  const out: BoardMaterialPriorReference[] = [];
  for (const n of named) {
    const p = priors.filter((x) => x.role === n.role);
    if (p.length !== 1 || boardMaterialRoles[n.role as BoardMaterialRole] !== n.methodId || p[0]!.methodId !== n.methodId || p[0]!.resultFingerprint !== n.fingerprint) return null;
    out.push({role: p[0]!.role, executionId: p[0]!.executionId, resultFingerprint: p[0]!.resultFingerprint});
  }
  return out;
}

/** The contract pins the discussion's own sources and, after them, every source a prior pinned that it does not, once. */
export function boardMaterialContractBasis(basis: ExecutionContractBasis, priors: readonly BoardMaterialPriorResult[], references: readonly BoardMaterialPriorReference[]): ExecutionContractBasis {
  const seen = new Set(basis.sources.map((s) => s.sourceVersionId)), sources = [...basis.sources];
  for (const r of references) for (const s of priors.find((p) => p.executionId === r.executionId)?.sources ?? []) if (!seen.has(s.sourceVersionId)) {seen.add(s.sourceVersionId); sources.push(s);}
  return {...basis, sources};
}

/** The board discussion packet: the discussion composed from this basis, each named result verbatim from its stored row. */
export function composeBoardMaterialPacket(basis: ExecutionContractBasis, ask: CapitalExecutionAsk, priors: readonly BoardMaterialPriorResult[], references: readonly BoardMaterialPriorReference[]) {
  return composeBoundBoardCapitalDiscussion({discussion: {envelope: basis.envelope, scope: {workId: basis.workId, purpose: basis.purpose, versionId: basis.versionId}}, question: ask.question,
    sources: references.map((r) => ({id: r.role, result: priors.find((p) => p.executionId === r.executionId)!.result}))});
}
