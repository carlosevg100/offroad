import {beforeEach, describe, expect, it, vi} from "vitest";

const {rpc, from, results} = vi.hoisted(() => {
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
import {registerWorkCompany} from "./actions";

const projectId = "10000000-0000-4000-8000-000000000001", dossierId = "10000000-0000-4000-8000-000000000002", entityId = "10000000-0000-4000-8000-000000000003";

describe("registering the company from the premise card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(results, {capital_projects: [{data: {id: projectId}}], document_intake_sessions: [{data: [], error: null}], dossiers: [{data: {id: dossierId}}], dossier_entity_links: [{data: [], error: null}]});
    rpc.mockImplementation(async (name: string) => name === "ensure_basis_entity_v1" ? {data: entityId, error: null} : {data: "10000000-0000-4000-8000-000000000004", error: null});
  });

  it("refuses a CNPJ whose check digits fail before writing anything", async () => {
    expect(await registerWorkCompany({locale: "pt-BR", projectId, name: "Companhia Sintética S.A.", cnpj: "11.222.333/0001-82"})).toEqual({ok: false, error: "invalid_cnpj"});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("registers the company under its CNPJ as the subject of the work's dossier", async () => {
    expect(await registerWorkCompany({locale: "pt-BR", projectId, name: "Companhia Sintética S.A.", cnpj: "11.222.333/0001-81"})).toEqual({ok: true});
    expect(rpc).toHaveBeenNthCalledWith(1, "ensure_basis_entity_v1", expect.objectContaining({p_dossier_id: dossierId, p_namespace: "BR:CNPJ", p_value: "11222333000181"}));
    expect(rpc).toHaveBeenCalledWith("link_dossier_entity_v1", expect.objectContaining({p_dossier_id: dossierId, p_entity_id: entityId, p_relationship: "subject", p_perimeter: {basis: "consolidated"}}));
  });
});
