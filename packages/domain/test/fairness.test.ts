import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildPeriodInput,
  cleanRegionRows,
  cleanStockRows,
  allocateFairness,
  isValidAllocation,
  parseCsv,
} from "../src/index.ts";
import type { PeriodInput, RawRegionRow, RawStockRow } from "../src/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_ROOT = join(__dirname, "..", "..", "..", "data", "samples");

function loadScenario(name: string): PeriodInput {
  const regionsCsv = readFileSync(join(SAMPLES_ROOT, name, "regions.csv"), "utf8");
  const stockCsv = readFileSync(join(SAMPLES_ROOT, name, "stock.csv"), "utf8");

  const rawRegions = parseCsv(regionsCsv) as unknown as RawRegionRow[];
  const rawStock = parseCsv(stockCsv) as unknown as RawStockRow[];

  const { rows: regionRows, issues: regionIssues } = cleanRegionRows(rawRegions);
  assert.deepEqual(regionIssues, [], `unexpected issues cleaning ${name}/regions.csv`);

  const { rows: stockRows, issues: stockIssues } = cleanStockRows(rawStock);
  assert.deepEqual(stockIssues, [], `unexpected issues cleaning ${name}/stock.csv`);

  const { input, issues: buildIssues } = buildPeriodInput("p1", regionRows, stockRows);
  assert.deepEqual(buildIssues, [], `unexpected issues building ${name} period input`);
  assert.ok(input, `expected a period input for ${name}`);
  return input!;
}

function allocMap(result: ReturnType<typeof allocateFairness>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of result.allocations) out[a.regionId] = a.allocatedKits;
  return out;
}

test("fairness golden spec: 120 kits, 60/60/60 demand, 60/40/60 capacity -> 40/40/40", () => {
  const input = loadScenario("normal");
  const result = allocateFairness(input);
  assert.deepEqual(allocMap(result), { A: 40, B: 40, C: 40 });
  assert.equal(result.totalAllocatedKits, 120);
  assert.equal(result.unallocatedKits, 0);
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("fairness reduced-capacity: B capped at 20 -> 50/20/50", () => {
  const input = loadScenario("reduced-capacity");
  const result = allocateFairness(input);
  assert.deepEqual(allocMap(result), { A: 50, B: 20, C: 50 });
  assert.equal(result.totalAllocatedKits, 120);
  assert.equal(result.unallocatedKits, 0);
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("fairness shortage: 90 kits, 60/60/60 demand -> 30/30/30", () => {
  const input = loadScenario("shortage");
  const result = allocateFairness(input);
  assert.deepEqual(allocMap(result), { A: 30, B: 30, C: 30 });
  assert.equal(result.totalAllocatedKits, 90);
  assert.equal(result.unallocatedKits, 0);
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("fairness surge intervention: +20 kits (140 total) while B stays 20 -> 60/20/60", () => {
  const base = loadScenario("reduced-capacity");
  const surgeInput: PeriodInput = { ...base, stockKits: 140 };
  const result = allocateFairness(surgeInput);
  assert.deepEqual(allocMap(result), { A: 60, B: 20, C: 60 });
  assert.equal(result.totalAllocatedKits, 140);
  assert.equal(result.unallocatedKits, 0);
  assert.equal(isValidAllocation(surgeInput, result).valid, true);
});

test("fairness closed center: capacity 0 stays visible, 0 allocation, cannot block A and B", () => {
  const base = loadScenario("normal");
  const input: PeriodInput = {
    ...base,
    regions: base.regions.map((r) =>
      r.regionId === "C" ? { ...r, capacityKits: 0, status: "closed" as const } : r
    ),
  };
  const result = allocateFairness(input);
  assert.deepEqual(allocMap(result), { A: 60, B: 40, C: 0 });
  assert.equal(result.totalAllocatedKits, 100);
  assert.equal(result.unallocatedKits, 20); // remaining stock cannot be given to C
  assert.equal(isValidAllocation(input, result).valid, true);
});
