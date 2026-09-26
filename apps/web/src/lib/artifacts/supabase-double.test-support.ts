/**
 * A minimal Supabase client double for the download route tests: each table answers one fixed
 * result (or a function of the filters the route applied), `rpc` is supplied by the test, and
 * storage downloads come from a map. Filters are recorded so a test can assert the scope it read.
 */

type Answer = {data: unknown; error: unknown};
export type TableAnswer = Answer | ((filters: ReadonlyArray<readonly [string, readonly unknown[]]>) => Answer);

export function supabaseDouble(input: {
  tables?: Record<string, TableAnswer>;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<Answer>;
  storage?: Record<string, (path: string) => Answer>;
} = {}) {
  const reads: Array<{table: string; filters: Array<readonly [string, readonly unknown[]]>}> = [];
  const from = (table: string) => {
    const filters: Array<readonly [string, readonly unknown[]]> = [];
    reads.push({table, filters});
    const answer = (): Answer => {
      const configured = input.tables?.[table];
      if (!configured) return {data: null, error: {message: `unexpected table ${table}`}};
      return typeof configured === "function" ? configured(filters) : configured;
    };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "in", "like", "order", "limit"]) {
      builder[method] = (...args: unknown[]) => {
        filters.push([method, args]);
        return builder;
      };
    }
    builder.maybeSingle = async () => {
      const result = answer();
      return {data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error};
    };
    builder.then = (resolve: (value: Answer) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(answer()).then(resolve, reject);
    return builder;
  };
  const rpc = input.rpc ?? (async (name: string) => ({data: null, error: {message: `unexpected rpc ${name}`}}));
  const storage = {from: (bucket: string) => ({download: async (path: string) => input.storage?.[bucket]?.(path) ?? {data: null, error: {message: "object not found"}}})};
  return {client: {from, rpc, storage}, reads};
}
