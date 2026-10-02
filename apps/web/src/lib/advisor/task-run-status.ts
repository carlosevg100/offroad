/** A running task is machine activity only while its bound job has a live lease.
 * Terminal job state is a fact; a missing/expired lease is an interruption, never success. */
export function effectiveTaskRunStatus(status: string, job: {status: string; lease_expires_at: string | null} | null, now = Date.now()): string {
  if (status !== "running") return status;
  if (!job) return "blocked";
  if (job.status === "failed" || job.status === "cancelled") return job.status;
  if (job.status === "queued") return "queued";
  if (job.status !== "leased" || !job.lease_expires_at) return "blocked";
  const expiry = Date.parse(job.lease_expires_at);
  return Number.isFinite(expiry) && expiry > now ? "running" : "blocked";
}
