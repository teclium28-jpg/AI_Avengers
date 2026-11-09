// Reusable data-preparation pipeline: CSV parsing + cleaning for the FairShare
// region/stock inputs. See docs/data-preparation.md for the schema and the
// reasoning behind each rule. Nothing here guesses at a missing value — every
// row that can't be trusted is reported as a DataIssue instead.

import type {
  DataIssue,
  PeriodInput,
  RawRegionRow,
  RawStockRow,
  RegionInputRow,
  RegionStatus,
  Provenance,
  StockInputRow,
  StockType,
} from "./types.ts";

const SUSPICIOUS_MAGNITUDE = 100_000;

/** Minimal dependency-free CSV parser: no quoted-comma support needed for this schema. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((cell) => cell.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseNonNegativeInt(
  raw: string,
  rowNum: number,
  column: string,
  issues: DataIssue[],
): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") {
    issues.push({
      kind: "missing_field",
      row: rowNum,
      column,
      message: `${column} is missing (missing is not zero — row rejected)`,
    });
    return null;
  }
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    issues.push({
      kind: "invalid_quantity",
      row: rowNum,
      column,
      message: `${column} = "${raw}" is not a whole number`,
    });
    return null;
  }
  const value = Number(trimmed);
  if (value < 0) {
    issues.push({
      kind: "invalid_quantity",
      row: rowNum,
      column,
      message: `${column} = ${value} is negative; quantities must be non-negative whole kits`,
    });
    return null;
  }
  if (value > SUSPICIOUS_MAGNITUDE) {
    issues.push({
      kind: "suspicious_magnitude",
      row: rowNum,
      column,
      message: `${column} = ${value} exceeds the ${SUSPICIOUS_MAGNITUDE} sanity ceiling — verify before trusting`,
    });
  }
  return value;
}

function requireField(
  raw: string | undefined,
  rowNum: number,
  column: string,
  issues: DataIssue[],
): string | null {
  if (!raw || raw.trim() === "") {
    issues.push({
      kind: "missing_field",
      row: rowNum,
      column,
      message: `${column} is missing`,
    });
    return null;
  }
  return raw.trim();
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export interface CleanRegionsResult {
  rows: RegionInputRow[];
  issues: DataIssue[];
}

/** Clean raw region rows: missing values, duplicates, inconsistent names, invalid quantities. */
export function cleanRegionRows(raw: RawRegionRow[]): CleanRegionsResult {
  const issues: DataIssue[] = [];
  const seenKeys = new Map<string, number>(); // "periodId|regionId" -> first row seen
  const cleaned: RegionInputRow[] = [];

  raw.forEach((r, idx) => {
    const rowNum = idx + 2; // +1 for header, +1 for 1-indexing

    const periodId = requireField(r.period_id, rowNum, "period_id", issues);
    const regionId = requireField(r.region_id, rowNum, "region_id", issues);
    const centerId = requireField(r.center_id, rowNum, "center_id", issues);
    const regionNameRaw = requireField(r.region_name, rowNum, "region_name", issues);

    const demandKits = parseNonNegativeInt(r.demand_kits, rowNum, "demand_kits", issues);
    const capacityKits = parseNonNegativeInt(r.capacity_kits, rowNum, "capacity_kits", issues);
    const priorDispatchedKits = parseNonNegativeInt(
      r.prior_dispatched_kits,
      rowNum,
      "prior_dispatched_kits",
      issues,
    );

    const statusRaw = requireField(r.status, rowNum, "status", issues);
    const provenanceRaw = requireField(
      r.reported_or_simulated,
      rowNum,
      "reported_or_simulated",
      issues,
    );

    if (
      periodId === null ||
      regionId === null ||
      centerId === null ||
      regionNameRaw === null ||
      demandKits === null ||
      capacityKits === null ||
      priorDispatchedKits === null ||
      statusRaw === null ||
      provenanceRaw === null
    ) {
      return; // row rejected; issues already recorded
    }

    const status = statusRaw.toLowerCase();
    if (status !== "open" && status !== "closed") {
      issues.push({
        kind: "invalid_quantity",
        row: rowNum,
        column: "status",
        message: `status = "${statusRaw}" must be "open" or "closed"`,
      });
      return;
    }
    const provenance = provenanceRaw.toLowerCase();
    if (provenance !== "reported" && provenance !== "simulated") {
      issues.push({
        kind: "invalid_quantity",
        row: rowNum,
        column: "reported_or_simulated",
        message: `reported_or_simulated = "${provenanceRaw}" must be "reported" or "simulated"`,
      });
      return;
    }

    if (status === "closed" && capacityKits > 0) {
      issues.push({
        kind: "inconsistent_status",
        row: rowNum,
        column: "status",
        message: `region ${regionId} is marked closed but capacity_kits = ${capacityKits} (expected 0)`,
      });
    }
    if (priorDispatchedKits > capacityKits && capacityKits > 0) {
      issues.push({
        kind: "impossible_balance",
        row: rowNum,
        message: `region ${regionId} has prior_dispatched_kits (${priorDispatchedKits}) exceeding capacity_kits (${capacityKits})`,
      });
    }

    const key = `${periodId}|${regionId}`;
    const firstSeenRow = seenKeys.get(key);
    if (firstSeenRow !== undefined) {
      issues.push({
        kind: "duplicate_row",
        row: rowNum,
        column: "region_id",
        message: `duplicate (period_id, region_id) for region ${regionId}; first seen at row ${firstSeenRow}. Neither row is kept automatically — resolve manually.`,
      });
      return;
    }
    seenKeys.set(key, rowNum);

    cleaned.push({
      periodId,
      regionId,
      regionName: normalizeName(regionNameRaw),
      centerId: centerId.trim(),
      demandKits,
      capacityKits,
      priorDispatchedKits,
      status: status as RegionStatus,
      provenance: provenance as Provenance,
    });
  });

  return { rows: cleaned, issues };
}

export interface CleanStockResult {
  rows: StockInputRow[];
  issues: DataIssue[];
}

export function cleanStockRows(raw: RawStockRow[]): CleanStockResult {
  const issues: DataIssue[] = [];
  const cleaned: StockInputRow[] = [];
  const seenPeriods = new Map<string, number>();

  raw.forEach((r, idx) => {
    const rowNum = idx + 2;

    const periodId = requireField(r.period_id, rowNum, "period_id", issues);
    const stockKits = parseNonNegativeInt(r.stock_kits, rowNum, "stock_kits", issues);
    const stockTypeRaw = requireField(r.stock_type, rowNum, "stock_type", issues);
    const source = (r.source ?? "").trim();
    const asOfDate = requireField(r.as_of_date, rowNum, "as_of_date", issues);

    if (periodId === null || stockKits === null || stockTypeRaw === null || asOfDate === null) {
      return;
    }

    const stockType = stockTypeRaw.toLowerCase();
    if (stockType !== "confirmed" && stockType !== "hypothetical") {
      issues.push({
        kind: "invalid_quantity",
        row: rowNum,
        column: "stock_type",
        message: `stock_type = "${stockTypeRaw}" must be "confirmed" or "hypothetical"`,
      });
      return;
    }

    if (stockType === "confirmed") {
      const firstSeenRow = seenPeriods.get(periodId);
      if (firstSeenRow !== undefined) {
        issues.push({
          kind: "duplicate_row",
          row: rowNum,
          column: "period_id",
          message: `duplicate confirmed stock row for period ${periodId}; first seen at row ${firstSeenRow}`,
        });
        return;
      }
      seenPeriods.set(periodId, rowNum);
    }

    cleaned.push({
      periodId,
      stockKits,
      stockType: stockType as StockType,
      source,
      asOfDate,
    });
  });

  return { rows: cleaned, issues };
}

export interface BuildPeriodInputResult {
  input: PeriodInput | null;
  issues: DataIssue[];
}

/**
 * Join cleaned region + stock rows into the PeriodInput the baseline engine consumes.
 * Only `confirmed` stock is used — hypothetical stock never becomes allocatable.
 */
export function buildPeriodInput(
  periodId: string,
  regionRows: RegionInputRow[],
  stockRows: StockInputRow[],
): BuildPeriodInputResult {
  const issues: DataIssue[] = [];
  const regions = regionRows.filter((r) => r.periodId === periodId);
  const confirmedStock = stockRows.find(
    (s) => s.periodId === periodId && s.stockType === "confirmed",
  );

  if (!confirmedStock) {
    issues.push({
      kind: "missing_field",
      row: 0,
      message: `no confirmed stock row found for period ${periodId}`,
    });
    return { input: null, issues };
  }

  const totalPriorDispatched = regions.reduce((sum, r) => sum + r.priorDispatchedKits, 0);
  if (totalPriorDispatched > confirmedStock.stockKits) {
    issues.push({
      kind: "impossible_balance",
      row: 0,
      message: `total prior_dispatched_kits (${totalPriorDispatched}) exceeds confirmed stock_kits (${confirmedStock.stockKits}) for period ${periodId}`,
    });
  }

  return {
    input: { periodId, stockKits: confirmedStock.stockKits, regions },
    issues,
  };
}
