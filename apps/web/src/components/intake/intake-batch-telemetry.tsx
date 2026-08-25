"use client";

import {useEffect} from "react";

import type {ArchetypeId} from "@offroad/credit-playbook";

import {captureProductEvent} from "@/lib/observability/capture";

type Props = {
  locale: "pt-BR" | "en-US";
  archetype: ArchetypeId;
  state: "ready" | "awaiting_evidence" | "complete";
  activeCount: number;
  hiddenOpenCount: number;
};

/** Emits aggregate product telemetry only. No case, tenant, document or request content leaves. */
export function IntakeBatchTelemetry({locale, archetype, state, activeCount, hiddenOpenCount}: Props) {
  useEffect(() => {
    captureProductEvent("intake_request_batch_viewed", {
      locale,
      archetype,
      state,
      activeCount,
      hiddenOpenCount,
    });
  }, [activeCount, archetype, hiddenOpenCount, locale, state]);

  return null;
}
