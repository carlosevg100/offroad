import * as Sentry from "@sentry/nextjs";

import {scrubSentryEvent} from "./src/lib/observability/privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  sendDefaultPii: false,
  enableLogs: false,
  includeLocalVariables: false,
  tracesSampleRate: 0.05,
  maxBreadcrumbs: 20,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
});
