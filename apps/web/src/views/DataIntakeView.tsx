import React, { useState } from "react";
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Database,
  ArrowRight,
} from "lucide-react";
import {
  parseCsv,
  cleanRegionRows,
  cleanStockRows,
  buildPeriodInput,
} from "@fairshare/domain";
import type {
  RegionInputRow,
  DataIssue,
  RawRegionRow,
  RawStockRow,
} from "../types";
import { BASE_REGIONS } from "../lib/scenarios";

interface DataIntakeViewProps {
  onApplyNewInputs: (newRegions: RegionInputRow[], newStock: number) => void;
}

export const DataIntakeView: React.FC<DataIntakeViewProps> = ({
  onApplyNewInputs,
}) => {
  const [regionsCsvContent, setRegionsCsvContent] = useState<string>(
    `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated
p1,A,Region A (North District),CTR-A,60,60,0,open,simulated
p1,B,Region B (Central Valley),CTR-B,60,40,0,open,simulated
p1,C,Region C (Coastal Belt),CTR-C,60,60,0,open,simulated`
  );

  const [stockCsvContent, setStockCsvContent] = useState<string>(
    `period_id,stock_kits,stock_type,source,as_of_date
p1,120,confirmed,warehouse count,2026-11-10`
  );

  const [parsedIssues, setParsedIssues] = useState<DataIssue[]>([]);
  const [cleanedRegions, setCleanedRegions] = useState<RegionInputRow[]>([]);
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

      const { input, issues: buildIssues } = buildPeriodInput("p1", regionRows, stockRows);
      allIssues.push(...buildIssues);

      setParsedIssues(allIssues);
      setHasValidated(true);

      if (input && allIssues.length === 0) {
        setCleanedRegions(input.regions);
        setCleanedStock(input.stockKits);
      }
    } catch (err: any) {
      setParsedIssues([
        {
          kind: "missing_field",
          row: 0,
          message: err.message || "Failed to parse CSV format",
        },
      ]);
      setHasValidated(true);
    }
  };

  const handleApply = () => {
    if (cleanedRegions.length > 0 && parsedIssues.length === 0) {
      onApplyNewInputs(cleanedRegions, cleanedStock);
      setSuccessBanner(
        `Successfully loaded ${cleanedRegions.length} regions and ${cleanedStock} confirmed stock kits into the Practice Desk.`
      );
      setTimeout(() => setSuccessBanner(null), 5000);
    }
  };

  const loadSample = (type: "normal" | "reduced" | "shortage") => {
    if (type === "normal") {
      setStockCsvContent(
        `period_id,stock_kits,stock_type,source,as_of_date\np1,120,confirmed,synthetic normal,2026-11-10`
      );
      setRegionsCsvContent(
        `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated\np1,A,Region A (North),CTR-A,60,60,0,open,simulated\np1,B,Region B (Valley),CTR-B,60,40,0,open,simulated\np1,C,Region C (Coastal),CTR-C,60,60,0,open,simulated`
      );
    } else if (type === "reduced") {
      setStockCsvContent(
        `period_id,stock_kits,stock_type,source,as_of_date\np1,120,confirmed,synthetic reduced,2026-11-10`
      );
      setRegionsCsvContent(
        `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated\np1,A,Region A (North),CTR-A,60,60,0,open,simulated\np1,B,Region B (Valley),CTR-B,60,20,0,open,simulated\np1,C,Region C (Coastal),CTR-C,60,60,0,open,simulated`
      );
    } else {
      setStockCsvContent(
        `period_id,stock_kits,stock_type,source,as_of_date\np1,90,confirmed,synthetic shortage,2026-11-10`
      );
      setRegionsCsvContent(
        `period_id,region_id,region_name,center_id,demand_kits,capacity_kits,prior_dispatched_kits,status,reported_or_simulated\np1,A,Region A (North),CTR-A,60,60,0,open,simulated\np1,B,Region B (Valley),CTR-B,60,40,0,open,simulated\np1,C,Region C (Coastal),CTR-C,60,60,0,open,simulated`
      );
    }
    setHasValidated(false);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Page Header */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Data Intake & CSV Validation Pipeline
              </h2>
              <p className="text-xs text-zinc-500">
                Pre-flight checks against strict SRS rules: non-negative integers, impossible balance detection, and CSV formula injection protection.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-zinc-400 font-medium">Quick Fixtures:</span>
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
          </div>
        </div>
      </div>

      {successBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Two-file editor & preview */}
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
            <span className="text-[11px] text-zinc-400 font-mono">Demands & Center Capacities</span>
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
            <span className="text-[11px] text-zinc-400 font-mono">Confirmed Warehouse Inventory</span>
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
          Cleaned shape enforces SRS invariants before persisting to official register.
        </div>
        <button
          onClick={handleValidate}
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm"
        >
          <FileCheck2 className="w-4 h-4 mr-1.5" />
          Run Pre-Flight Validation
        </button>
      </div>

      {/* Validation results section */}
      {hasValidated && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 className="text-sm font-semibold text-zinc-900">
              Pre-Flight Validation Assessment
            </h3>
            {parsedIssues.length === 0 ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                All Constraints Validated
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                {parsedIssues.length} Invalidation Issues Detected
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
                <div>• Verified Regions: <span className="font-mono font-bold">{cleanedRegions.length} distribution zones</span></div>
                <div>• Total Regional Demand: <span className="font-mono font-bold">{cleanedRegions.reduce((sum, r) => sum + r.demandKits, 0)} kits</span></div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleApply}
                  className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 shadow-sm"
                >
                  Apply Validated Data to Practice Desk
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
