import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildPeriodInput,
  cleanRegionRows,
  cleanStockRows,
  computeBaselineAllocation,
  isValidAllocation,
  parseCsv,
} from "../src/index.ts";
import type { PeriodInput, RawRegionRow, RawStockRow, RegionInputRow } from "../src/types.ts";

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

function allocMap(result: ReturnType<typeof computeBaselineAllocation>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of result.allocations) out[a.regionId] = a.allocatedKits;
  return out;
}

test("normal scenario: 120 kits, 60/60/60 demand, 60/40/60 capacity -> 40/40/40", () => {
  const input = loadScenario("normal");
  const result = computeBaselineAllocation(input);
  assert.deepEqual(allocMap(result), { A: 40, B: 40, C: 40 });
  assert.equal(result.totalAllocatedKits, 120);
  assert.equal(result.unallocatedKits, 0);
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("reduced-capacity scenario: B capped at 20 -> 50/20/50", () => {
  const input = loadScenario("reduced-capacity");
  const result = computeBaselineAllocation(input);
  assert.deepEqual(allocMap(result), { A: 50, B: 20, C: 50 });
  assert.equal(result.totalAllocatedKits, 120);
  assert.equal(isValidAllocation(input, result).valid, true);

  const b = result.allocations.find((a) => a.regionId === "B")!;
  assert.equal(b.boundByCapacity, true);
  assert.equal(b.coverage, 20 / 60);
});

test("shortage scenario: stock short of demand, no capacity binding -> 30/30/30", () => {
  const input = loadScenario("shortage");
  const result = computeBaselineAllocation(input);
  assert.deepEqual(allocMap(result), { A: 30, B: 30, C: 30 });
  assert.equal(result.totalAllocatedKits, 90);
  assert.equal(result.unallocatedKits, 0);
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("context.md intervention: add 20 kits while B capacity stays 20 -> 60/20/60, B still underserved", () => {
  const regions: RegionInputRow[] = [
    { periodId: "p1", regionId: "A", regionName: "Region A", centerId: "CTR-A", demandKits: 60, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
    { periodId: "p1", regionId: "B", regionName: "Region B", centerId: "CTR-B", demandKits: 60, capacityKits: 20, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
    { periodId: "p1", regionId: "C", regionName: "Region C", centerId: "CTR-C", demandKits: 60, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
  ];
  const input: PeriodInput = { periodId: "p1", stockKits: 140, regions };
  const result = computeBaselineAllocation(input);
  assert.deepEqual(allocMap(result), { A: 60, B: 20, C: 60 });
  assert.equal(result.unallocatedKits, 0); // demand fully met for A/C; B capacity-bound
  const b = result.allocations.find((a) => a.regionId === "B")!;
  assert.ok(b.coverage! < 1, "B remains underserved relative to its own demand");
});

test("zero stock -> everyone gets zero, no crash", () => {
  const regions: RegionInputRow[] = [
    { periodId: "p1", regionId: "A", regionName: "Region A", centerId: "CTR-A", demandKits: 60, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
  ];
  const input: PeriodInput = { periodId: "p1", stockKits: 0, regions };
  const result = computeBaselineAllocation(input);
  assert.deepEqual(allocMap(result), { A: 0 });
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("zero demand region -> coverage is N/A (null), gets no allocation", () => {
  const regions: RegionInputRow[] = [
    { periodId: "p1", regionId: "A", regionName: "Region A", centerId: "CTR-A", demandKits: 0, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
    { periodId: "p1", regionId: "B", regionName: "Region B", centerId: "CTR-B", demandKits: 60, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
  ];
  const input: PeriodInput = { periodId: "p1", stockKits: 60, regions };
  const result = computeBaselineAllocation(input);
  const a = result.allocations.find((r) => r.regionId === "A")!;
  assert.equal(a.allocatedKits, 0);
  assert.equal(a.coverage, null);
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("closed region (capacity 0) stays visible but gets no new allocation, cannot block others", () => {
  const regions: RegionInputRow[] = [
    { periodId: "p1", regionId: "A", regionName: "Region A", centerId: "CTR-A", demandKits: 60, capacityKits: 0, priorDispatchedKits: 0, status: "closed", provenance: "simulated" },
    { periodId: "p1", regionId: "B", regionName: "Region B", centerId: "CTR-B", demandKits: 60, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
  ];
  const input: PeriodInput = { periodId: "p1", stockKits: 60, regions };
  const result = computeBaselineAllocation(input);
  assert.deepEqual(allocMap(result), { A: 0, B: 60 });
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("prior dispatch commitments are preserved, not reassigned", () => {
  const regions: RegionInputRow[] = [
    { periodId: "p1", regionId: "A", regionName: "Region A", centerId: "CTR-A", demandKits: 60, capacityKits: 60, priorDispatchedKits: 20, status: "open", provenance: "simulated" },
    { periodId: "p1", regionId: "B", regionName: "Region B", centerId: "CTR-B", demandKits: 60, capacityKits: 60, priorDispatchedKits: 0, status: "open", provenance: "simulated" },
  ];
  const input: PeriodInput = { periodId: "p1", stockKits: 100, regions };
  const result = computeBaselineAllocation(input);
  const a = result.allocations.find((r) => r.regionId === "A")!;
  assert.ok(a.allocatedKits >= 20, "A's prior dispatch must never be reduced");
  assert.equal(isValidAllocation(input, result).valid, true);
});

test("capped demand (zero capacity but confirmed demand) leaves region at zero without erasing it", () => {
  const regions: RegionInputRow[] = [
    { periodId: "p1", regionId: "A", regionName: "Region A", centerId: "CTR-A", demandKits: 40, capacityKits: 0, priorDispatchedKits: 0, status: "closed", provenance: "simulated" },
  ];
  const input: PeriodInput = { periodId: "p1", stockKits: 100, regions };
  const result = computeBaselineAllocation(input);
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].allocatedKits, 0);
  assert.equal(result.unallocatedKits, 100);
});
