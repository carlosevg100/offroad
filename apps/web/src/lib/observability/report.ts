import * as Sentry from "@sentry/nextjs";

import {redactTelemetryText} from "./privacy";

/**
 * One way to report a server-side failure, redacted before it leaves the process.
 *
 * Five places used to call `console.error` with the raw error message. Two things were wrong
 * with that, and the second is the one that matters.
 *
 * A message from Postgres or from a schema parse is not a constant: `invalid input syntax for
 * type numeric: "48200000.55"` and `expected string, received "Rede Horizonte S.A."` both carry
 * the value that failed. ADR 0003 says telemetry never becomes a side copy of the company's
 * content, and the redaction that enforces it (`redactTelemetryText`) was only ever applied to
 * what went through Sentry. The console path bypassed it, so the one path that was actually
 * running was the one with no redaction on it.
 *
 * And a swallowed failure is invisible. Vercel aggregates thrown exceptions into error groups,
 * which is how a bad deploy is noticed at all today; a caught error that turns into a friendly
 * message and a log line never reaches that view. Reporting through Sentry's capture keeps the
 * failure visible when a DSN exists, and the structured console line keeps it greppable when one
 * does not, which is the state this project is in right now.
 */

export type ServerFailure = {
  /** Stable, low-cardinality name of what failed. Never interpolated from input. */
  step: string;
  /** The error as it arrived, of whatever shape. Only its safe parts are read. */
  error?: unknown;
  /** Extra low-cardinality context. Values are redacted like everything else. */
  context?: Record<string, string | number | boolean | null | undefined>;
};

/** What can be said about an error without repeating what it was carrying. */
function describe(error: unknown): {code: string | null; message: string | null; name: string | null} {
  if (!error || typeof error !== "object") {
    return {code: null, message: error == null ? null : redactTelemetryText(String(error)), name: null};
  }
  const shape = error as {code?: unknown; message?: unknown; name?: unknown};
  return {
    // A Postgres SQLSTATE or a PostgREST code is a constant and the most useful field here.
    code: typeof shape.code === "string" ? shape.code : null,
    message: typeof shape.message === "string" ? redactTelemetryText(shape.message).slice(0, 300) : null,
    name: typeof shape.name === "string" ? shape.name : null,
  };
}

export function reportServerFailure({step, error, context}: ServerFailure): void {
  const described = describe(error);

  const detail = {
    step,
    ...described,
    ...Object.fromEntries(
      Object.entries(context ?? {}).map(([key, value]) => [
        key,
        typeof value === "string" ? redactTelemetryText(value) : value,
      ]),
    ),
  };

  // A no-op without a DSN, which is deliberate (ADR 0003): absent configuration keeps the
  // adapter safely silent rather than half-configured. The message is already redacted, and
  // `beforeSend` redacts it again on the way out; twice is cheaper than once too few.
  Sentry.captureException(new Error(`${step}: ${described.code ?? described.name ?? "failed"}`), {
    level: "error",
    tags: {step},
    extra: detail,
  });

  console.error("server_failure", detail);
}
