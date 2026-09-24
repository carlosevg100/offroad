/**
 * The provider preflight of the intent router gate. It runs inside the worker now, with the rest of
 * the gate's run under the governed evaluation transport, so it lives with the family contract in
 * `@offroad/agent-contracts`; this module keeps the names the evals scripts and tests import.
 */
export {
  IntentRouterProviderPreflightError,
  preflightIntentRouterProviders,
  type IntentRouterProviderPreflight,
} from "@offroad/agent-contracts";
