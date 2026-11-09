import type { PeriodInput, RegionInputRow } from "../types";

export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  input: PeriodInput;
  expectedAllocation: Record<string, number>;
}

export const BASE_REGIONS: RegionInputRow[] = [
  {
    periodId: "p1",
    regionId: "A",
    regionName: "Region A (North District)",
    centerId: "CTR-A",
    demandKits: 60,
    capacityKits: 60,
    priorDispatchedKits: 0,
    status: "open",
    provenance: "simulated",
  },
  {
    periodId: "p1",
    regionId: "B",
    regionName: "Region B (Central Valley)",
    centerId: "CTR-B",
    demandKits: 60,
    capacityKits: 40,
    priorDispatchedKits: 0,
    status: "open",
    provenance: "simulated",
  },
  {
    periodId: "p1",
    regionId: "C",
    regionName: "Region C (Coastal Belt)",
    centerId: "CTR-C",
    demandKits: 60,
    capacityKits: 60,
    priorDispatchedKits: 0,
    status: "open",
    provenance: "simulated",
  },
];

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "golden-baseline",
    name: "Golden Baseline",
    description: "120 kits, 60/40/60 capacities. Perfect equal sharing at 40/40/40 (66.7% coverage).",
    input: {
      periodId: "p1",
      stockKits: 120,
      regions: BASE_REGIONS.map((r) => ({ ...r })),
    },
    expectedAllocation: { A: 40, B: 40, C: 40 },
  },
  {
    id: "b-throttled",
    name: "Center B Throttled to 20",
    description: "Center B storage damage caps throughput at 20. Excess stock shifts fairly to A and C (50/20/50).",
    input: {
      periodId: "p1",
      stockKits: 120,
      regions: BASE_REGIONS.map((r) =>
        r.regionId === "B" ? { ...r, capacityKits: 20 } : { ...r }
      ),
    },
    expectedAllocation: { A: 50, B: 20, C: 50 },
  },
  {
    id: "stock-surge",
    name: "Stock Surge (+20 kits)",
    description: "140 kits available while Center B remains throttled at 20. A and C receive 60/60 (100%), B remains at 20.",
    input: {
      periodId: "p1",
      stockKits: 140,
      regions: BASE_REGIONS.map((r) =>
        r.regionId === "B" ? { ...r, capacityKits: 20 } : { ...r }
      ),
    },
    expectedAllocation: { A: 60, B: 20, C: 60 },
  },
  {
    id: "restore-b",
    name: "Restore Center B",
    description: "Restores Center B capacity to 40 with 120 kits. Proves reversibility back to 40/40/40.",
    input: {
      periodId: "p1",
      stockKits: 120,
      regions: BASE_REGIONS.map((r) =>
        r.regionId === "B" ? { ...r, capacityKits: 40 } : { ...r }
      ),
    },
    expectedAllocation: { A: 40, B: 40, C: 40 },
  },
  {
    id: "emergency-closure",
    name: "Emergency Closure (Center C)",
    description: "Center C closed (capacity 0). Region C demand remains visible (unserviceable), but cannot block distribution to A & B (60/40/0).",
    input: {
      periodId: "p1",
      stockKits: 120,
      regions: BASE_REGIONS.map((r) =>
        r.regionId === "C" ? { ...r, capacityKits: 0, status: "closed" } : { ...r }
      ),
    },
    expectedAllocation: { A: 60, B: 40, C: 0 },
  },
];
