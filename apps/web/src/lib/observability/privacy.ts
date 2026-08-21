import type {Event} from "@sentry/nextjs";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const tokenPattern = /\b[A-Za-z0-9_-]{32,}\b/g;
const numericPattern = /(^|[^A-Za-z])[-+]?\d[\d.,]*(?:\s?(?:%|x|bps))?/g;
/**
 * A quoted literal that is not an identifier.
 *
 * Postgres and Zod both quote the thing that failed, and the thing that failed is often the
 * company's own content: `expected string, received "Rede Horizonte Alimentos S.A."`. What they
 * also quote is the name of a constraint, a table or a column, and those are constants worth
 * keeping, since without them a redacted message says nothing at all. The two are told apart by
 * shape rather than by guesswork: an identifier here is lower-case, digits and underscores, and
 * anything with a space, a capital or punctuation is content.
 */
const quotedLiteralPattern = /"([^"]{1,200})"/g;
const looksLikeIdentifier = (value: string) => /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(value);

const allowedTags = new Set(["environment", "release", "route_class", "runtime"]);

export function redactTelemetryText(value: string): string {
  return value
    .replace(emailPattern, "[email]")
    .replace(uuidPattern, "[id]")
    .replace(tokenPattern, "[token]")
    .replace(/([?&])[^\s#]+/g, "$1[query]")
    .replace(quotedLiteralPattern, (match, inner: string) =>
      looksLikeIdentifier(inner) ? match : '"[value]"',
    )
    .replace(numericPattern, "$1[number]");
}

/**
 * A stack frame's filename, kept fetchable.
 *
 * The blanket redactor replaces every run of digits with `[number]`, which is right for a
 * message (a number in a message is usually money) and wrong for a path (a number in a path is
 * a build hash). Run over a frame it turned
 * `/_next/static/immutable/chunks/08f3ut8074cvq.js` into
 * `/_next/static/immutable/chunks/[number]f[number]ut[number]cvq.js`, a file that does not
 * exist, so Sentry could never fetch the script or its source map and every browser trace
 * stayed minified no matter what the build emitted.
 *
 * What still goes: the query string, and anything that is identifying on its own. An email, a
 * uuid or a long token in a path is redacted exactly as before. Only the digit rule is dropped,
 * and only here.
 */
function sanitizeFrameFilename(value: string | undefined): string | undefined {
  if (!value) return value;

  const withoutQuery = value.split("?")[0] ?? value;
  return withoutQuery
    .replace(emailPattern, "[email]")
    .replace(uuidPattern, "[id]")
    .replace(tokenPattern, "[token]");
}

function sanitizeUrl(value: string | undefined): string | undefined {
  if (!value) return value;

  try {
    const url = new URL(value, "https://offroad.invalid");
    const path = url.pathname
      .split("/")
      .map((segment) => redactTelemetryText(segment))
      .join("/");
    return url.origin === "https://offroad.invalid" ? path : `${url.origin}${path}`;
  } catch {
    return redactTelemetryText(value.split("?")[0] ?? value);
  }
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  const tags = Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([key]) => allowedTags.has(key)),
  );

  return {
    ...event,
    message: event.message ? redactTelemetryText(event.message) : undefined,
    logentry: event.logentry?.message
      ? {message: redactTelemetryText(event.logentry.message)}
      : undefined,
    transaction: event.transaction ? redactTelemetryText(event.transaction) : undefined,
    request: event.request
      ? {
          method: event.request.method,
          url: sanitizeUrl(event.request.url),
        }
      : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map((exception) => ({
            type: exception.type,
            value: exception.value ? redactTelemetryText(exception.value) : undefined,
            stacktrace: exception.stacktrace
              ? {
                  frames: exception.stacktrace.frames?.map((frame) => ({
                    colno: frame.colno,
                    filename: sanitizeFrameFilename(frame.filename),
                    function: frame.function,
                    in_app: frame.in_app,
                    lineno: frame.lineno,
                  })),
                }
              : undefined,
          })),
        }
      : undefined,
    breadcrumbs: event.breadcrumbs?.slice(-20).map((breadcrumb) => ({
      category: breadcrumb.category,
      level: breadcrumb.level,
      message: breadcrumb.message ? redactTelemetryText(breadcrumb.message) : undefined,
      timestamp: breadcrumb.timestamp,
      type: breadcrumb.type,
    })),
    contexts: event.contexts?.trace ? {trace: event.contexts.trace} : undefined,
    tags,
    user: undefined,
    extra: undefined,
    fingerprint: undefined,
    spans: undefined,
    threads: undefined,
  } as T;
}
