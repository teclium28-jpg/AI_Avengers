import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { allocateReference, evaluateAllocation, optimizeAllocation } from '../src/index.ts';
import type { PeriodInput } from '../src/index.ts';

const make = (name: string, stockKits: number, demand: (i: number) => number,
  capacity = demand, prior: (i: number) => number = () => 0): { name: string; input: PeriodInput } => ({ name,
    input: { periodId: 'benchmark', stockKits, regions: Array.from({ length: 100 }, (_, i) => {
      const capacityKits = capacity(i);
      return { periodId: 'benchmark', regionId: `R${String(i).padStart(3, '0')}`, regionName: `Synthetic ${i}`,
        centerId: `C${i}`, demandKits: demand(i), capacityKits, priorDispatchedKits: prior(i),
        status: capacityKits === 0 ? 'closed' : 'open', provenance: 'simulated' };
    }) } });
const workloads = [
  make('mostly-equal', 50_000, i => 1000 + i % 3),
  make('highly-unequal', 50_000, i => i === 99 ? 1_000_000_000 : 10 + i * i),
  make('capped-and-closed', 50_000, () => 10_000, i => i % 4 === 0 ? 0 : i % 4 === 1 ? 5 : 10_000),
  make('many-ties', 50_037, () => 1000),
  make('large-safe-stock', Number.MAX_SAFE_INTEGER, i => 100_000_000_000_000 + i),
  make('existing-commitments', 50_000, () => 1000, () => 1000, i => i % 5 * 50),
];
const warmup = 25, samples = 100;
console.log(JSON.stringify({ environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, warmup, samples, timed: 'validation + allocation + result explanations; evaluator outside timed section' }));
function measure(workload: typeof workloads[number], reference = false) {
  const fn = reference ? allocateReference : optimizeAllocation;
  const result = fn(workload.input);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const check = evaluateAllocation(workload.input, result);
  if (!check.feasible || check.policy.status !== 'conforms') throw new Error(JSON.stringify(check));
  const w = reference ? 3 : warmup, n = reference ? 15 : samples;
  for (let i = 0; i < w; i++) fn(workload.input);
  const durations: number[] = [];
  for (let i = 0; i < n; i++) { const start = performance.now(); fn(workload.input); durations.push(performance.now() - start); }
  durations.sort((a, b) => a - b);
  console.log(JSON.stringify({ workload: workload.name, implementation: reference ? 'scan-reference' : 'exact-rank',
    regions: 100, stockKits: workload.input.stockKits, preservedCommitmentsKits: result.preservedCommitmentsKits,
    allocatedKits: result.totalAllocatedKits, warmup: w, samples: n,
    medianMs: durations[Math.ceil(n / 2) - 1], p95Ms: durations[Math.ceil(n * 0.95) - 1] }));
}
// Establish why a per-kit implementation does not meet this stock workload.
measure(workloads[0], true);
for (const workload of workloads) measure(workload);
