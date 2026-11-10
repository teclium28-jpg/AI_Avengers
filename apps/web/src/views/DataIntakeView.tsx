import React, { useState } from "react";
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Database,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Download,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  parseCsv,
  cleanRegionRows,
  cleanStockRows,
  prepareImport,
} from "@fairshare/domain";
import type { DataIssue, RawRegionRow, RawStockRow, RegionEntity } from "../types";
import { useOperational } from "../context/OperationalContext";
import {
  INDIA_REGIONS_CSV,
  INDIA_STOCK_CSV,
  INDIA_DIRTY_REGIONS_CSV,
} from "../lib/indiaSamples";

export const DataIntakeView: React.FC = () => {
  const { applyBatchIntake, setActivePage } = useOperational();

  const [regionsCsvContent, setRegionsCsvContent] = useState<string>(INDIA_REGIONS_CSV);
  const [stockCsvContent, setStockCsvContent] = useState<string>(INDIA_STOCK_CSV);

  const [parsedIssues, setParsedIssues] = useState<DataIssue[]>([]);
  const [cleanedRegions, setCleanedRegions] = useState<RegionEntity[]>([]);
  const [cleanedStock, setCleanedStock] = useState<number>(15520);
  const [hasValidated, setHasValidated] = useState<boolean>(true);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [showRawEditor, setShowRawEditor] = useState<boolean>(false);

  // Validate CSVs using domain pipeline
  const runValidation = (regCsv: string, stCsv: string) => {
    try {
      const rawRegions = parseCsv(regCsv) as unknown as RawRegionRow[];
      const rawStock = parseCsv(stCsv) as unknown as RawStockRow[];

      const { rows: regionRows, issues: regionIssues } = cleanRegionRows(rawRegions);
      const { rows: stockRows, issues: stockIssues } = cleanStockRows(rawStock);

      const allIssues = [...regionIssues, ...stockIssues];

      const prep = prepareImport("2026-W46", regionRows, stockRows);
      allIssues.push(...prep.issues);

      setParsedIssues(allIssues);
      setHasValidated(true);

      if (prep.ok && prep.input && allIssues.length === 0) {
        const mappedRegions: RegionEntity[] = prep.input.regions.map((r) => ({
          regionId: r.regionId,
          regionName: r.regionName,
          assignedCenterId: r.centerId,
          demandKits: r.demandKits,
          status: r.status === "open" ? "active" : "ineligible",
        }));
        setCleanedRegions(mappedRegions);
        setCleanedStock(prep.input.stockKits);
      } else {
        setCleanedRegions([]);
      }
    } catch (err: any) {
      setParsedIssues([
        {
          kind: "missing_field",
          row: 0,
          message: err.message || "Failed to parse CSV format",
        },
      ]);
      setCleanedRegions([]);
      setHasValidated(true);
    }
  };

  const handleApply = () => {
    if (cleanedRegions.length > 0 && parsedIssues.length === 0) {
      applyBatchIntake(cleanedRegions, cleanedStock);
      setSuccessBanner(
        `Successfully transferred ${cleanedRegions.length} verified regions and ${cleanedStock.toLocaleString()} confirmed stock kits to the Allocation Planner.`
      );
      setTimeout(() => {
        setSuccessBanner(null);
        setActivePage("studio");
      }, 1500);
    }
  };

  const handleLoadStatewide = () => {
    setRegionsCsvContent(INDIA_REGIONS_CSV);
    setStockCsvContent(INDIA_STOCK_CSV);
    runValidation(INDIA_REGIONS_CSV, INDIA_STOCK_CSV);
  };

  const handleLoadMetropolitan = () => {
    const reg = `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated
2026-W46,A,Zone 1 — Northern Wards,CTR-A,60,60,0,open,reported
2026-W46,B,Zone 2 — Central Transit Belt,CTR-B,60,40,0,open,reported
2026-W46,C,Zone 3 — Coastal Waterfront,CTR-C,60,60,0,open,reported`;
    const st = `period_id,stock_kits,stock_type,source,as_of_date
2026-W46,120,confirmed,Central Warehouse Count,2026-11-10`;
    setRegionsCsvContent(reg);
    setStockCsvContent(st);
    runValidation(reg, st);
  };

  const handleLoadCorruptSample = () => {
    setRegionsCsvContent(INDIA_DIRTY_REGIONS_CSV);
    setStockCsvContent(INDIA_STOCK_CSV);
    runValidation(INDIA_DIRTY_REGIONS_CSV, INDIA_STOCK_CSV);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Data Management
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Pre-Flight Validation Engine Active
            </span>
          </div>
          <h1 className="text-xl font-bold text-zinc-950 font-sans mt-1">
            Census Ingestion & Inventory Import
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Ingest and verify regional food demand census and warehouse inventories. Strictly enforces data integrity before register commits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleLoadStatewide}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors shadow-sm"
          >
            Load Statewide Census (30 Districts)
          </button>
          <button
            onClick={handleLoadMetropolitan}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 transition-colors"
          >
            Load Metropolitan Benchmark (3 Wards)
          </button>
          <button
            onClick={handleLoadCorruptSample}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 transition-colors"
          >
            Test Data Cleansing Rules
          </button>
        </div>
      </div>

      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <span className="text-xs text-emerald-600 font-semibold animate-pulse">Redirecting to Planner...</span>
        </div>
      )}

      {/* Validation Status Banner */}
      <div
        className={`rounded-xl border p-5 shadow-sm transition-all ${
          parsedIssues.length === 0
            ? "bg-white border-emerald-200 ring-1 ring-emerald-500/10"
            : "bg-rose-50/50 border-rose-200"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            {parsedIssues.length === 0 ? (
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-700" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-zinc-950 font-sans">
                {parsedIssues.length === 0
                  ? "Census & Inventory Verification Succeeded"
                  : `Integrity Validation Failed (${parsedIssues.length} issues detected)`}
              </h3>
              <p className="text-xs text-zinc-600 mt-0.5">
                {parsedIssues.length === 0
                  ? `${cleanedRegions.length} district records and ${cleanedStock.toLocaleString()} confirmed stock kits passed all SRS integrity rules.`
                  : "Corrupted or non-compliant rows must be resolved before this data can enter the official allocation engine."}
              </p>
            </div>
          </div>

          {parsedIssues.length === 0 ? (
            <button
              onClick={handleApply}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0"
            >
              <ArrowRight className="w-4 h-4 mr-1.5" />
              Apply to Allocation Planner
            </button>
          ) : (
            <button
              onClick={handleLoadStatewide}
              className="inline-flex items-center px-3 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-medium shrink-0"
            >
              Revert to Clean Dataset
            </button>
          )}
        </div>

        {/* Issue Details List (if any) */}
        {parsedIssues.length > 0 && (
          <div className="mt-4 pt-4 border-t border-rose-200/60 space-y-2">
            <span className="text-xs font-bold text-rose-900 uppercase tracking-wider font-mono">
              Rejection Diagnostics:
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {parsedIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-white rounded-lg border border-rose-200 text-rose-800 flex items-start space-x-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-mono font-bold text-[11px] uppercase bg-rose-100 px-1 py-0.2 rounded text-rose-800 mr-1.5">
                      {issue.kind}
                    </span>
                    {issue.row > 0 && <span className="font-mono text-zinc-500 mr-1.5">Row {issue.row}:</span>}
                    <span className="text-zinc-800">{issue.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Overview Cards: Loaded Census & Inventory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Regions Manifest Card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-mono">
                Regional Demand Census
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
              {regionsCsvContent.split("\n").filter((l) => l.trim()).length - 1} records
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Defines target administrative districts, assigned distribution hubs, local demand, and current operating status.
          </p>

          <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs font-mono text-zinc-700 max-h-40 overflow-y-auto divide-y divide-zinc-200/50">
            {regionsCsvContent
              .split("\n")
              .slice(0, 7)
              .map((line, idx) => (
                <div key={idx} className="py-1 truncate">
                  {line}
                </div>
              ))}
            <div className="py-1 text-zinc-400 italic">... and remaining records</div>
          </div>
        </div>

        {/* Stock Manifest Card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-mono">
                Warehouse Stock Register
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Confirmed Physical Count
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Authoritative inventory lots stored in central staging hubs available for immediate disaster dispatch.
          </p>

          <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs font-mono text-zinc-700 max-h-40 overflow-y-auto divide-y divide-zinc-200/50">
            {stockCsvContent
              .split("\n")
              .map((line, idx) => (
                <div key={idx} className="py-1 truncate">
                  {line}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Raw CSV Editor (Collapsible Drawer for power users) */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
        <button
          onClick={() => setShowRawEditor(!showRawEditor)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span>Advanced: Direct CSV Source Code Editor</span>
          </div>
          {showRawEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showRawEditor && (
          <div className="p-5 border-t border-zinc-200 bg-zinc-50/50 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1 font-mono">
                  regions.csv
                </label>
                <textarea
                  rows={8}
                  value={regionsCsvContent}
                  onChange={(e) => {
                    setRegionsCsvContent(e.target.value);
                    runValidation(e.target.value, stockCsvContent);
                  }}
                  className="w-full text-xs font-mono text-zinc-800 bg-white p-3 rounded-lg border border-zinc-300 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 block mb-1 font-mono">
                  stock.csv
                </label>
                <textarea
                  rows={8}
                  value={stockCsvContent}
                  onChange={(e) => {
                    setStockCsvContent(e.target.value);
                    runValidation(regionsCsvContent, e.target.value);
                  }}
                  className="w-full text-xs font-mono text-zinc-800 bg-white p-3 rounded-lg border border-zinc-300 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
