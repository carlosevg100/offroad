import type {Event} from "@sentry/nextjs";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const tokenPattern = /\b[A-Za-z0-9_-]{32,}\b/g;
const numericPattern = /(^|[^A-Za-z])[-+]?\d[\d.,]*(?:\s?(?:%|x|bps))?/g;

const allowedTags = new Set(["environment", "release", "route_class", "runtime"]);

export function redactTelemetryText(value: string): string {
  return value
    .replace(emailPattern, "[email]")
    .replace(uuidPattern, "[id]")
    .replace(tokenPattern, "[token]")
    .replace(/([?&])[^\s#]+/g, "$1[query]")
    .replace(numericPattern, "$1[number]");
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
                    filename: sanitizeUrl(frame.filename),
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
