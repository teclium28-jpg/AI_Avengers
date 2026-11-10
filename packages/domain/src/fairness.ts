import type { BaselineResult, PeriodInput } from './types.ts';
import type { EngineFailure } from './optimization-contract.ts';
import { optimizeAllocation } from './optimization.ts';

// Keep the original public shape: frontend helpers also accept Hamilton rows.
export type FairnessResult = BaselineResult;
export class AllocationInputError extends Error {
  readonly details: EngineFailure;
  constructor(details: EngineFailure) {
    super(`FairShare ${details.kind}: ${details.findings.map(f => f.code).join(', ')}`);
    this.name = 'AllocationInputError';
    this.details = details;
  }
}
/** Compatibility entry point. New consumers should use optimizeAllocation's union. */
export function allocateFairness(input: PeriodInput): FairnessResult {
  const outcome = optimizeAllocation(input);
  if (!outcome.ok) throw new AllocationInputError(outcome);
  return outcome;
}
