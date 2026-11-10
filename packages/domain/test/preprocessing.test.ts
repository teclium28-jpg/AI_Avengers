import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanRegionRows, cleanStockRows, parseCsv } from "../src/index.ts";
import type { RawRegionRow, RawStockRow } from "../src/types.ts";

function row(overrides: Partial<RawRegionRow> = {}): RawRegionRow {
  return {
    period_id: "p1",
    region_id: "A",
    region_name: "Region A",
    center_id: "CTR-A",
    demand_kits: "60",
    capacity_kits: "60",
    prior_dispatched_kits: "0",
    status: "open",
    reported_or_simulated: "simulated",
    ...overrides,
  };
}

test("parseCsv parses a simple header + rows", () => {
  const rows = parseCsv("a,b\n1,2\n3,4\n");
  assert.deepEqual(rows, [
    { a: "1", b: "2" },
    { a: "3", b: "4" },
  ]);
});

test("missing demand_kits is rejected, not defaulted to zero", () => {
  const { rows, issues } = cleanRegionRows([row({ demand_kits: "" })]);
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "missing_field");
  assert.equal(issues[0].column, "demand_kits");
});

test("non-integer quantity is rejected", () => {
  const { rows, issues } = cleanRegionRows([row({ capacity_kits: "12.5" })]);
  assert.equal(rows.length, 0);
  assert.equal(issues[0].kind, "invalid_quantity");
});

test("negative quantity is rejected", () => {
  const { rows, issues } = cleanRegionRows([row({ demand_kits: "-5" })]);
  assert.equal(rows.length, 0);
  assert.equal(issues[0].kind, "invalid_quantity");
});

test("duplicate (period_id, region_id) is flagged and neither row kept", () => {
  const { rows, issues } = cleanRegionRows([row(), row({ demand_kits: "70" })]);
  assert.equal(rows.length, 1); // first row kept, second flagged+dropped
  assert.equal(issues.some((i) => i.kind === "duplicate_row"), true);
});

test("names are trimmed and whitespace-collapsed", () => {
  const { rows, issues } = cleanRegionRows([row({ region_name: "  Region   A  " })]);
  assert.deepEqual(issues, []);
  assert.equal(rows[0].regionName, "Region A");
});

test("closed region with nonzero capacity is flagged as inconsistent", () => {
  const { rows, issues } = cleanRegionRows([row({ status: "closed", capacity_kits: "40" })]);
  assert.equal(rows.length, 1); // flagged, not dropped — human resolves it
  assert.equal(issues.some((i) => i.kind === "inconsistent_status"), true);
});

test("prior dispatch exceeding capacity is flagged as an impossible balance", () => {
  const { issues } = cleanRegionRows([
    row({ capacity_kits: "40", prior_dispatched_kits: "50" }),
  ]);
  assert.equal(issues.some((i) => i.kind === "impossible_balance"), true);
});

test("suspiciously large quantity is flagged but still accepted", () => {
  const { rows, issues } = cleanRegionRows([row({ demand_kits: "500000" })]);
  assert.equal(rows.length, 1);
  assert.equal(issues.some((i) => i.kind === "suspicious_magnitude"), true);
});

function stockRow(overrides: Partial<RawStockRow> = {}): RawStockRow {
  return {
    period_id: "p1",
    stock_kits: "120",
    stock_type: "confirmed",
    source: "synthetic",
    as_of_date: "2026-11-10",
    ...overrides,
  };
}

test("hypothetical stock is accepted as a row but kept distinct from confirmed", () => {
  const { rows, issues } = cleanStockRows([stockRow({ stock_type: "hypothetical" })]);
  assert.deepEqual(issues, []);
  assert.equal(rows[0].stockType, "hypothetical");
});

test("duplicate confirmed stock rows for the same period are flagged", () => {
  const { rows, issues } = cleanStockRows([stockRow(), stockRow({ stock_kits: "100" })]);
  assert.equal(rows.length, 1);
  assert.equal(issues.some((i) => i.kind === "duplicate_row"), true);
});
