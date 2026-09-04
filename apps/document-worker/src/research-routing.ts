import {join} from "node:path";

import {createSourcePackAcquirer, createSourcePackProvider, type PublicSearchProvider, type SourcePack, type SourcePackEntry} from "@offroad/public-research";

import {loadSourcePack} from "./source-pack-runtime";

export type LoadedSourcePack = {pack: SourcePack; read: (entry: SourcePackEntry) => Promise<Uint8Array>};

export type JobResearch<TFactory, TAcquirer> = {
  providers: PublicSearchProvider[];
  officialResearchProviderFactory: TFactory | undefined;
  contentAcquirer: TAcquirer | undefined;
  /** The case whose pack the job reads, or null when research is live. */
  frozenCaseId: string | null;
  sourcePackId: string | null;
};

export class SourcePackUnavailableError extends Error {
  readonly code = "source_pack_unavailable";
  constructor(readonly sourcePackId: string, reason: string) {
    super(`source pack ${sourcePackId} is unavailable: ${reason}`);
  }
}

/**
 * Which research a job may do. A job whose project is bound to a frozen source pack reads that
 * pack and nothing else, on the same worker that serves everyone else live; the binding travels
 * in the claim. A bound job whose pack the worker cannot load fails rather than falling back to
 * the internet: a frozen case that quietly went live would not be a measurement.
 */
export function createResearchRouter<TFactory, TAcquirer>(input: {
  live: {providers: PublicSearchProvider[]; officialResearchProviderFactory: TFactory | undefined; contentAcquirer: TAcquirer | undefined; frozenCaseId: string | null};
  packsDir: string | undefined;
  load?: (directory: string) => Promise<LoadedSourcePack>;
  contentAcquirerFromPack: (loaded: LoadedSourcePack) => TAcquirer;
}) {
  const load = input.load ?? loadSourcePack;
  const cache = new Map<string, Promise<LoadedSourcePack>>();
  return async (job: {source_pack_id?: string | null | undefined}): Promise<JobResearch<TFactory, TAcquirer>> => {
    const sourcePackId = job.source_pack_id ?? null;
    if (!sourcePackId) return {...input.live, sourcePackId: null};
    if (!input.packsDir) throw new SourcePackUnavailableError(sourcePackId, "SOURCE_PACKS_DIR is not configured on this worker");
    let loading = cache.get(sourcePackId);
    if (!loading) {
      loading = load(join(input.packsDir, sourcePackId)).catch((error: Error) => {
        cache.delete(sourcePackId);
        throw new SourcePackUnavailableError(sourcePackId, error.message);
      });
      cache.set(sourcePackId, loading);
    }
    const loaded = await loading;
    return {
      providers: [createSourcePackProvider(loaded.pack)],
      officialResearchProviderFactory: undefined,
      contentAcquirer: input.contentAcquirerFromPack(loaded),
      frozenCaseId: loaded.pack.caseId,
      sourcePackId,
    };
  };
}

export {createSourcePackAcquirer};
