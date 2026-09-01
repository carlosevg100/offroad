"use client";

import {useEffect} from "react";

import {captureProductEvent} from "@/lib/observability/capture";

type Props = {
  locale: string;
  surface: "onboarding" | "workspace";
  journey: "company" | "originator";
  stage: "start" | "company" | "operation" | "preliminary" | "documents" | "review";
  state: "open" | "processing" | "failed" | "review_ready";
  documentCount?: number;
  activeRequestCount?: number;
};

export function evidenceBand(count: number): "none" | "single" | "two_to_five" | "six_plus" {
  if (count <= 0) return "none";
  if (count === 1) return "single";
  if (count <= 5) return "two_to_five";
  return "six_plus";
}

export function requestBand(count: number): "none" | "one_to_two" | "three_to_five" {
  if (count <= 0) return "none";
  if (count <= 2) return "one_to_two";
  return "three_to_five";
}

/**
 * Anonymous funnel instrumentation for M0.
 *
 * Only finite enums and count bands leave the browser. No tenant, case, person, document,
 * company, value, filename or free-form content is accepted by the event schema.
 */
export function IntakeJourneyTelemetry({
  locale,
  surface,
  journey,
  stage,
  state,
  documentCount = 0,
  activeRequestCount = 0,
}: Props) {
  useEffect(() => {
    captureProductEvent("intake_journey_stage_viewed", {
      locale: locale === "en-US" ? "en-US" : "pt-BR",
      surface,
      journey,
      stage,
      state,
      evidenceBand: evidenceBand(documentCount),
      requestBand: requestBand(activeRequestCount),
    });
  }, [activeRequestCount, documentCount, journey, locale, stage, state, surface]);

  return null;
}
