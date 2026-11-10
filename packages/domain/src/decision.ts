import type { BaselineResult, PeriodInput } from './types.ts';
import { ENGINE_VERSION, POLICY_VERSION } from './optimization-contract.ts';
import { compareAllocations } from './optimization-comparison.ts';
import { evaluateAllocation } from './optimization-evaluator.ts';

export interface AuthoritativeSnapshot {
  organizationId: string; periodId: string; revision: number; input: PeriodInput;
  provenance: 'reported' | 'simulated'; assumptions: string[];
  sources: { stock: unknown; regions: unknown[] };
}
export type DecisionAlgorithm = 'srs-progressive-maxmin' | 'hamilton-proportional' | 'manual-override';
export interface DecisionChoice { algorithm: DecisionAlgorithm; reason: string; overrides?: { regionId: string; newlyAllocatedKits: number }[] }

/** Canonical JSON v1: sorted UTF-16 object keys, array order preserved, finite numbers. */
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 40) throw new Error('Canonical content exceeds nesting limit');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value).map(v => canonicalJson(v, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k], depth + 1)).join(',') + '}';
  }
  throw new Error('Canonical content must be plain JSON');
}
export async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function computeDecision(snapshot: AuthoritativeSnapshot, choice: DecisionChoice) {
  if (!['srs-progressive-maxmin', 'hamilton-proportional', 'manual-override'].includes(choice.algorithm)) throw new Error('Unknown decision algorithm');
  if (!choice.reason || choice.reason.trim().length < 3 || choice.reason.length > 1000) throw new Error('A meaningful reason of 3..1000 characters is required');
  const comparison = compareAllocations(snapshot.input);
  if (!comparison.ok) return comparison;
  let result: BaselineResult = choice.algorithm === 'hamilton-proportional' ? comparison.baseline : comparison.fairness;
  if (choice.algorithm === 'manual-override') {
    const rows = choice.overrides ?? [];
    const inputs = new Map(snapshot.input.regions.map(r => [r.regionId, r]));
    const allocations = rows.map(a => {
      const row = inputs.get(a.regionId);
      const allocatedKits = (row?.priorDispatchedKits ?? 0) + a.newlyAllocatedKits;
      return { ...a, allocatedKits, coverage: row?.demandKits ? allocatedKits / row.demandKits : null, boundByCapacity: !!row && allocatedKits === row.capacityKits && row.demandKits > row.capacityKits };
    }).sort((a, b) => a.regionId < b.regionId ? -1 : a.regionId > b.regionId ? 1 : 0);
    const total = allocations.reduce((s, r) => s + r.allocatedKits, 0);
    result = { periodId: snapshot.input.periodId, totalStockKits: snapshot.input.stockKits, totalAllocatedKits: total, unallocatedKits: snapshot.input.stockKits - total, allocations };
  } else if (choice.overrides) throw new Error('Overrides require the manual-override algorithm');
  const validation = evaluateAllocation(snapshot.input, result, { detailed: choice.algorithm === 'srs-progressive-maxmin', checkPolicy: choice.algorithm === 'srs-progressive-maxmin' });
  if (!validation.feasible || validation.policy.status === 'violates') return { ok: false as const, kind: 'invalid_decision', findings: [...validation.feasibility, ...validation.policy.findings] };
  return { ok: true as const, formatVersion: 'decision-receipt/1', snapshot, choice,
    policyVersion: choice.algorithm === 'srs-progressive-maxmin' ? POLICY_VERSION : choice.algorithm + '/1', engineVersion: ENGINE_VERSION,
    result, comparison, validation };
}
export type DecisionRecord = Extract<ReturnType<typeof computeDecision>, { ok: true }>;
export async function replayDecision(record: DecisionRecord, expectedHash: string, current?: AuthoritativeSnapshot) {
  if (await fingerprint(record) !== expectedHash) return { status: 'tampered' as const };
  if (record.engineVersion !== ENGINE_VERSION || record.formatVersion !== 'decision-receipt/1') return { status: 'engine_unavailable' as const, recordedEngineVersion: record.engineVersion };
  const replayed = computeDecision(record.snapshot, record.choice);
  if (!replayed.ok || canonicalJson(replayed) !== canonicalJson(record)) return { status: 'mismatch' as const };
  const fresh = current ? computeDecision(current, record.choice) : null;
  const old = new Map(record.snapshot.input.regions.map(r => [r.regionId, r]));
  const changes: { code: string; whyItMatters: string; regionIds: string[]; before: unknown; after: unknown }[] = [];
  if (current) {
    // The revision counter also advances when this decision is accepted, so it is not evidence;
    // changed stock, demand, capacity or dispatch records are, and they appear in `sources`.
    if (canonicalJson(current.sources) !== canonicalJson(record.snapshot.sources)) changes.push({code:'EVIDENCE_CHANGED',whyItMatters:'The authoritative revision or source evidence changed; quantities may still produce the same allocation.',regionIds:current.input.regions.map(r=>r.regionId),before:{revision:record.snapshot.revision,sources:record.snapshot.sources},after:{revision:current.revision,sources:current.sources}});
    if (current.input.stockKits !== record.snapshot.input.stockKits) changes.push({ code: 'STOCK_CHANGED', whyItMatters: 'Changes the pool available for new allocation.', regionIds: current.input.regions.map(r => r.regionId), before: record.snapshot.input.stockKits, after: current.input.stockKits });
    for (const r of current.input.regions) {
      const previous = old.get(r.regionId);
      if (!previous || canonicalJson(previous) !== canonicalJson(r)) changes.push({ code: 'REGION_INPUT_CHANGED', whyItMatters: 'Demand, capacity, commitments or assignment determine eligibility and coverage.', regionIds: [r.regionId], before: previous ?? null, after: r });
      old.delete(r.regionId);
    }
    for (const r of old.values()) changes.push({ code: 'REGION_REMOVED', whyItMatters: 'The region is absent from the current planning input.', regionIds: [r.regionId], before: r, after: null });
  }
  const before = new Map(record.result.allocations.map(r => [r.regionId, r.allocatedKits]));
  const differences = fresh?.ok ? [...new Set([...before.keys(), ...fresh.result.allocations.map(a => a.regionId)])].sort().map(regionId => ({ regionId, before: before.get(regionId) ?? null, after: fresh.result.allocations.find(a => a.regionId === regionId)?.allocatedKits ?? null })) : [];
  return { status: 'exact' as const, replayed, current: fresh, changed: !!current && canonicalJson({ ...record.snapshot, revision: 0 }) !== canonicalJson({ ...current, revision: 0 }), changes, differences };
}
