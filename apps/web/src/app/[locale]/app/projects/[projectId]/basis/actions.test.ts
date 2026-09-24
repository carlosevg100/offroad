import {beforeEach, describe, expect, it, vi} from "vitest";

const {rpc, from, results} = vi.hoisted(() => {
  // Each table answers its queries in order; the chain accepts any filter the action applies.
  const results: Record<string, unknown[]> = {};
  const from = vi.fn((table: string) => {
    const answer = () => results[table]!.length > 1 ? results[table]!.shift() : results[table]![0];
    const chain: Record<string, unknown> = {
      maybeSingle: async () => answer(),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject),
    };
    for (const method of ["select", "eq", "in", "is", "or", "limit"]) chain[method] = () => chain;
    return chain;
  });
  return {rpc: vi.fn(), from, results};
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/workspace", () => ({requireWorkspace: vi.fn(async () => ({supabase: {rpc, from}, organization: {id: "10000000-0000-4000-8000-000000000009"}}))}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
import {recordBasisEntity} from "./actions";

const projectId = "10000000-0000-4000-8000-000000000001", dossierId = "10000000-0000-4000-8000-000000000002", entityId = "10000000-0000-4000-8000-000000000003";
const input = {locale: "pt-BR", projectId, dossierId, name: "Companhia Sintética S.A.", namespace: "BR:CNPJ", value: "00000000000191", reason: "Revisão explícita da identidade", relationship: "subject", perimeter: "consolidated"};
const recorded = (basis: string) => ({data: [{perimeter: {basis}}], error: null});
const linkCalls = () => rpc.mock.calls.filter(([name]) => name === "link_dossier_entity_v1");

describe("registering the company under analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(results, {capital_projects: [{data: {id: projectId}}], document_intake_sessions: [{data: [], error: null}], dossiers: [{data: {id: dossierId}}], dossier_entity_links: [{data: [], error: null}]});
    rpc.mockImplementation(async (name: string) => name === "ensure_basis_entity_v1" ? {data: entityId, error: null} : {data: "10000000-0000-4000-8000-000000000004", error: null});
  });

  it("links the reviewed identity to the dossier with the chosen role and perimeter", async () => {
    expect(await recordBasisEntity(input)).toEqual({ok: true});
    expect(rpc).toHaveBeenNthCalledWith(1, "ensure_basis_entity_v1", {p_dossier_id: dossierId, p_name: input.name, p_namespace: "BR:CNPJ", p_value: input.value, p_reason: input.reason});
    expect(linkCalls()).toEqual([["link_dossier_entity_v1", {p_dossier_id: dossierId, p_entity_id: entityId, p_relationship: "subject", p_perimeter: {basis: "consolidated"},
      p_valid_from: expect.any(String), p_valid_until: null, p_reason: input.reason, p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/)}]]);
  });

  it("creates no second link when the same role and perimeter are already recorded", async () => {
    results.dossier_entity_links = [recorded("consolidated")];
    expect(await recordBasisEntity(input)).toEqual({ok: true});
    expect(linkCalls()).toHaveLength(0);
  });

  it("keeps a recorded role with another perimeter and says so", async () => {
    results.dossier_entity_links = [recorded("standalone")];
    expect(await recordBasisEntity(input)).toEqual({ok: false, error: "roleExists"});
    expect(linkCalls()).toHaveLength(0);
  });

  it("settles a concurrent link of the same role on the recorded link", async () => {
    results.dossier_entity_links = [{data: [], error: null}, recorded("consolidated")];
    rpc.mockImplementation(async (name: string) => name === "ensure_basis_entity_v1" ? {data: entityId, error: null} : {data: null, error: {code: "22023", message: "identity_period_overlap"}});
    expect(await recordBasisEntity(input)).toEqual({ok: true});
    expect(linkCalls()).toHaveLength(1);
  });

  it("refuses a role outside the dossier contract before reading or writing anything", async () => {
    expect(await recordBasisEntity({...input, relationship: "borrower"})).toEqual({ok: false, error: "invalid"});
    expect(await recordBasisEntity({...input, perimeter: undefined})).toEqual({ok: false, error: "invalid"});
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("links nothing when the identity review is refused", async () => {
    rpc.mockResolvedValue({data: null, error: {code: "40001", message: "identity_review_conflict"}});
    expect(await recordBasisEntity(input)).toEqual({ok: false, error: "conflict"});
    expect(linkCalls()).toHaveLength(0);
  });
});
