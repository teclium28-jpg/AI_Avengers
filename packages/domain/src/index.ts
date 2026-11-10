// Shared pure input preparation, Hamilton baseline and discrete progressive policy.
export * from "./types.ts";
export * from "./preprocessing.ts";
export * from "./baseline.ts";
export * from "./fairness.ts";
export { POLICY_VERSION, ENGINE_VERSION, MAX_REGIONS, REFERENCE_MAX_NEW_KITS, validateOptimizationInput } from "./optimization-contract.ts";
export type { Finding, EngineFailure, ExplanationCode, Explanation, ExactCoverage, OptimizationRegion, OptimizationResult, EngineOutcome } from "./optimization-contract.ts";
export * from "./optimization.ts";
export * from "./optimization-reference.ts";
export * from "./optimization-evaluator.ts";
export * from "./optimization-comparison.ts";
export * from "./interventions.ts";
export * from "./reconciliation.ts";
export * from "./decision.ts";
export * from "./receipt-export.ts";
