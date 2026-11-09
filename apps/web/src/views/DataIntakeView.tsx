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
} from "lucide-react";
import {
  parseCsv,
  cleanRegionRows,
  cleanStockRows,
  buildPeriodInput,
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
  const { applyBatchIntake } = useOperational();

  const [regionsCsvContent, setRegionsCsvContent] = useState<string>(
    `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated
2026-W46,A,Zone 1 — Northern Wards,CTR-A,60,60,0,open,reported
2026-W46,B,Zone 2 — Central Transit Belt,CTR-B,60,40,0,open,reported
2026-W46,C,Zone 3 — Coastal Waterfront,CTR-C,60,60,0,open,reported`
  );

  const [stockCsvContent, setStockCsvContent] = useState<string>(
    `period_id,stock_kits,stock_type,source,as_of_date
2026-W46,120,confirmed,Central Warehouse Count,2026-11-10`
  );

  const [parsedIssues, setParsedIssues] = useState<DataIssue[]>([]);
  const [cleanedRegions, setCleanedRegions] = useState<RegionEntity[]>([]);
  const [cleanedStock, setCleanedStock] = useState<number>(120);
  const [hasValidated, setHasValidated] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Validate CSVs using Ananya's domain pipeline
  const handleValidate = () => {
    try {
      const rawRegions = parseCsv(regionsCsvContent) as unknown as RawRegionRow[];
      const rawStock = parseCsv(stockCsvContent) as unknown as RawStockRow[];

      const { rows: regionRows, issues: regionIssues } = cleanRegionRows(rawRegions);
      const { rows: stockRows, issues: stockIssues } = cleanStockRows(rawStock);

      const allIssues = [...regionIssues, ...stockIssues];

      // Use safe import gate from domain package
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
        `Successfully transferred ${cleanedRegions.length} verified regions and ${cleanedStock} confirmed stock kits into the Allocation Studio.`
      );
      setTimeout(() => setSuccessBanner(null), 5000);
    }
  };

  const loadSample = (type: "normal" | "reduced" | "shortage" | "india" | "india_dirty") => {
    if (type === "normal") {
      setStockCsvContent(
        `period_id,stock_kits,stock_type,source,as_of_date\n2026-W46,120,confirmed,Central Warehouse Normal Count,2026-11-10`
      );
      setRegionsCsvContent(
        `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated\n2026-W46,A,Zone 1 (North),CTR-A,60,60,0,open,reported\n2026-W46,B,Zone 2 (Central),CTR-B,60,40,0,open,reported\n2026-W46,C,Zone 3 (Coastal),CTR-C,60,60,0,open,reported`
      );
    } else if (type === "reduced") {
      setStockCsvContent(
        `period_id,stock_kits,stock_type,source,as_of_date\n2026-W46,120,confirmed,Central Warehouse Count,2026-11-10`
      );
      setRegionsCsvContent(
        `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated\n2026-W46,A,Zone 1 (North),CTR-A,60,60,0,open,reported\n2026-W46,B,Zone 2 (Central Throttled),CTR-B,60,20,0,open,reported\n2026-W46,C,Zone 3 (Coastal),CTR-C,60,60,0,open,reported`
      );
    } else if (type === "shortage") {
      setStockCsvContent(
        `period_id,stock_kits,stock_type,source,as_of_date\n2026-W46,90,confirmed,Scarcity Depleted Reserve,2026-11-10`
      );
      setRegionsCsvContent(
        `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated\n2026-W46,A,Zone 1 (North),CTR-A,60,60,0,open,reported\n2026-W46,B,Zone 2 (Central),CTR-B,60,40,0,open,reported\n2026-W46,C,Zone 3 (Coastal),CTR-C,60,60,0,open,reported`
      );
    } else if (type === "india") {
      setStockCsvContent(INDIA_STOCK_CSV);
      setRegionsCsvContent(INDIA_REGIONS_CSV);
    } else if (type === "india_dirty") {
      setStockCsvContent(INDIA_STOCK_CSV);
      setRegionsCsvContent(INDIA_DIRTY_REGIONS_CSV);
    }
    setHasValidated(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 font-sans">
            Batch Data Ingestion & Pre-Flight Validation
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Validates census demand and warehouse inventory against strict SRS rules before register persistence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400 font-medium">Load Scenarios:</span>
          <button
            onClick={() => loadSample("normal")}
            className="px-2.5 py-1 text-xs font-medium rounded border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-700"
          >
            Normal (120)
          </button>
          <button
            onClick={() => loadSample("reduced")}
            className="px-2.5 py-1 text-xs font-medium rounded border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-700"
          >
            B Capped (20)
          </button>
          <button
            onClick={() => loadSample("shortage")}
            className="px-2.5 py-1 text-xs font-medium rounded border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-700"
          >
            Shortage (90)
          </button>
          <span className="h-4 w-px bg-zinc-200 mx-1" />
          <button
            onClick={() => loadSample("india")}
            className="px-2.5 py-1 text-xs font-semibold rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800"
          >
            India 30-District
          </button>
          <button
            onClick={() => loadSample("india_dirty")}
            className="px-2.5 py-1 text-xs font-medium rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800"
          >
            Injected Errors (Demo)
          </button>
        </div>
      </div>

      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* CSV Editors Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* regions.csv */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-mono">
                regions.csv
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">Zone Demands & Assigned Nodes</span>
          </div>

          <textarea
            rows={8}
            value={regionsCsvContent}
            onChange={(e) => {
              setRegionsCsvContent(e.target.value);
              setHasValidated(false);
            }}
            className="w-full text-xs font-mono text-zinc-800 bg-zinc-50 p-3 rounded-lg border border-zinc-300 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* stock.csv */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-mono">
                stock.csv
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">Confirmed Depot Stock</span>
          </div>

          <textarea
            rows={8}
            value={stockCsvContent}
            onChange={(e) => {
              setStockCsvContent(e.target.value);
              setHasValidated(false);
            }}
            className="w-full text-xs font-mono text-zinc-800 bg-zinc-50 p-3 rounded-lg border border-zinc-300 focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Validation trigger bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center justify-between">
        <div className="text-xs text-zinc-600">
          Executes strict data cleansing: rejects missing numbers, impossible balances, and spreadsheet injection.
        </div>
        <button
          onClick={handleValidate}
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm"
        >
          <FileCheck2 className="w-4 h-4 mr-1.5" />
          Run Cleanse & Validation
        </button>
      </div>

      {/* Validation results section */}
      {hasValidated && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 className="text-sm font-semibold text-zinc-900 font-sans">
              Validation Assessment Report
            </h3>
            {parsedIssues.length === 0 ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                All Regulatory Invariants Passed
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                {parsedIssues.length} Invalidation Errors
              </span>
            )}
          </div>

          {parsedIssues.length > 0 ? (
            <div className="border border-rose-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-rose-100 text-left text-xs">
                <thead className="bg-rose-50/50 font-semibold text-rose-900">
                  <tr>
                    <th className="py-2.5 px-4">Row #</th>
                    <th className="py-2.5 px-4">Column</th>
                    <th className="py-2.5 px-4">Issue Kind</th>
                    <th className="py-2.5 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50 text-rose-800">
                  {parsedIssues.map((iss, idx) => (
                    <tr key={idx} className="hover:bg-rose-50/20">
                      <td className="py-2 px-4 font-mono">{iss.row || "Header"}</td>
                      <td className="py-2 px-4 font-mono">{iss.column || "—"}</td>
                      <td className="py-2 px-4 font-medium">{iss.kind}</td>
                      <td className="py-2 px-4">{iss.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 text-xs text-zinc-700">
                <div className="font-semibold text-zinc-900 mb-1">
                  Validated Input Dataset Overview:
                </div>
                <div>• Confirmed Stock: <span className="font-mono font-bold">{cleanedStock} kits</span></div>
                <div>• Verified Zones: <span className="font-mono font-bold">{cleanedRegions.length} zones</span></div>
                <div>• Total Regional Demand: <span className="font-mono font-bold">{cleanedRegions.reduce((sum, r) => sum + r.demandKits, 0)} kits</span></div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleApply}
                  className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm"
                >
                  Transfer Validated Data to Allocation Studio
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
