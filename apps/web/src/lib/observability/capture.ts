"use client";

import posthog from "posthog-js";

import {
  parseProductEvent,
  type ProductEventName,
  type ProductEventProperties,
} from "./events";

export function captureProductEvent<Name extends ProductEventName>(
  name: Name,
  properties: ProductEventProperties<Name>,
): boolean {
  const safeProperties = parseProductEvent(name, properties);
  if (!safeProperties || !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return false;
  if (posthog.has_opted_out_capturing()) return false;

  posthog.capture(name, safeProperties);
  return true;
}
