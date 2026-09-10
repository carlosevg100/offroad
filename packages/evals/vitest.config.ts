import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    // Gold cases compile full financial/material pipelines and parse large source tapes.
    // Bound their concurrent CPU/memory use inside the parallel monorepo quality job.
    maxWorkers: 2,
  },
});
