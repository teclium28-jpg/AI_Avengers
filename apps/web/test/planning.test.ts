import test from "node:test";
import assert from "node:assert/strict";
import {
  computePlan, committedByCenter, summarizeCenterLedger, checkMovement, dispatchHeadroom,
  toSafeCsv, intakeToEntities, intakeIssues, formatPct, PERIOD_ID,
} from "../src/lib/planning.ts";
import type { CenterEntity, MovementRecord, RegionEntity } from "../src/types.ts";

const center = (id: string, capacity: number, extra: Partial<CenterEntity> = {}): CenterEntity =>
  ({ centerId: id, centerName: id + " hub", configuredCapacity: capacity, committedDispatches: 0, operatingStatus: "active", ...extra });
const region = (id: string, demand: number, centerId = "CTR-" + id, extra: Partial<RegionEntity> = {}): RegionEntity =>
  ({ regionId: id, regionName: "Region " + id, assignedCenterId: centerId, demandKits: demand, status: "active", ...extra });
const three = (capB = 40, extraC: Partial<CenterEntity> = {}) => [center("CTR-A", 60), center("CTR-B", capB), center("CTR-C", 60, extraC)];
const abc = () => [region("A", 60), region("B", 60), region("C", 60)];
const kits = (rows: { regionId: string; allocatedKits: number }[]) => Object.fromEntries(rows.map(r => [r.regionId, r.allocatedKits]));
let n = 0;
const mv = (centerId: string, movementType: MovementRecord["movementType"], quantityKits: number): MovementRecord =>
  ({ recordId: "m" + ++n, waybillNumber: "WB", periodId: PERIOD_ID, centerId, centerName: centerId, movementType, quantityKits,
     timestampUTC: new Date(2026, 10, 10, 0, n).toISOString(), timestampIST: "", carrierOrAgent: "x", verifiedBy: "x", notes: "" });
/** Ledger stored newest first, as the app stores it. */
const ledger = (...events: MovementRecord[]) => [...events].reverse();

test("golden scenarios from context.md and FRONTEND.md section 4.3", () => {
  const plan = (stock: number, capB: number, extraC: Partial<CenterEntity> = {}) => kits(computePlan(stock, three(capB, extraC), abc(), {}, "srs-progressive-maxmin").rows);
  assert.deepEqual(plan(120, 40), { A: 40, B: 40, C: 40 });
  assert.deepEqual(plan(120, 20), { A: 50, B: 20, C: 50 });
  assert.deepEqual(plan(140, 20), { A: 60, B: 20, C: 60 });
  assert.deepEqual(plan(120, 40), { A: 40, B: 40, C: 40 }, "restoring B is reversible");
  assert.deepEqual(plan(120, 40, { operatingStatus: "closed" }), { A: 60, B: 40, C: 0 });
});

test("closure keeps need visible, marks the region unserviceable and keeps it in unmet demand", () => {
  const p = computePlan(120, three(40, { operatingStatus: "closed" }), abc(), {}, "srs-progressive-maxmin");
  const c = p.rows.find(r => r.regionId === "C")!;
  assert.equal(c.status, "unserviceable"); assert.equal(c.demandKits, 60); assert.equal(c.allocatedKits, 0);
  assert.equal(p.totalUnmetKits, 80, "B is 20 short, closed C keeps all 60 of its need"); assert.equal(p.issues.length, 0);
  assert.equal(p.minCoveragePct, 0, "an unserviceable region with need has 0% coverage, not N/A");
});

test("closing a center after a dispatch preserves the dispatch instead of crashing", () => {
  const committed = { "CTR-A": 0, "CTR-B": 30, "CTR-C": 0 };
  const p = computePlan(120, three(40).map(c => c.centerId === "CTR-B" ? { ...c, operatingStatus: "closed" as const } : c), abc(), committed, "srs-progressive-maxmin");
  assert.deepEqual(p.issues, []);
  const b = p.rows.find(r => r.regionId === "B")!;
  assert.equal(b.allocatedKits, 30); assert.equal(b.newlyAllocatedKits, 0); assert.equal(b.status, "unserviceable");
  assert.equal(p.totalAllocatedKits, 120);
});

test("inputs the engine refuses become readable issues, never exceptions", () => {
  const overCapacity = computePlan(120, three(20), abc(), { "CTR-B": 30 }, "srs-progressive-maxmin");
  assert.equal(overCapacity.issues[0].code, "COMMITMENT_EXCEEDS_LIMIT"); assert.match(overCapacity.issues[0].message, /Region B: 30 kits were already dispatched/);
  assert.equal(overCapacity.rows.find(r => r.regionId === "B")!.allocatedKits, 30, "fallback shows preserved commitments only");
  assert.equal(computePlan(10, three(), abc(), { "CTR-A": 20 }, "srs-progressive-maxmin").issues[0].code, "COMMITMENTS_EXCEED_STOCK");
  assert.equal(computePlan(120, three(), [region("A", 60), region("B", 60, "CTR-A")], {}, "srs-progressive-maxmin").issues[0].code, "SHARED_CENTER_UNSUPPORTED");
  for (const bad of [NaN, -1, 1.5]) assert.equal(computePlan(bad, three(), abc(), {}, "srs-progressive-maxmin").issues[0].code, "INVALID_STOCK");
  assert.equal(computePlan(120, three(), [region("A", NaN)], {}, "srs-progressive-maxmin").issues[0].code, "INVALID_QUANTITY");
  assert.equal(computePlan(120, three(20), abc(), { "CTR-B": 30 }, "hamilton-proportional").issues[0].code, "COMMITMENT_EXCEEDS_LIMIT", "baseline refuses the same inputs");
});

test("zero demand and ineligible regions have N/A coverage and do not drag the fairness floor", () => {
  const p = computePlan(120, three(), [region("A", 60), region("B", 0), region("C", 60, "CTR-C", { status: "ineligible" })], {}, "srs-progressive-maxmin");
  const by = Object.fromEntries(p.rows.map(r => [r.regionId, r]));
  assert.equal(by.B.status, "zero_demand"); assert.equal(by.C.status, "ineligible"); assert.equal(by.C.allocatedKits, 0);
  assert.equal(p.minCoveragePct, 100); assert.equal(p.averageCoveragePct, 100);
  assert.equal(p.totalDemandKits, 60, "ineligible regions are outside the program");
  assert.equal(formatPct(computePlan(10, three(), [region("A", 0)], {}, "srs-progressive-maxmin").minCoveragePct), "N/A");
});

test("statuses: full, capacity capped and fair partial", () => {
  const by = Object.fromEntries(computePlan(150, three(20), abc(), {}, "srs-progressive-maxmin").rows.map(r => [r.regionId, r.status]));
  assert.deepEqual(by, { A: "full", B: "capacity_capped", C: "full" });
  assert.equal(computePlan(30, three(), abc(), {}, "srs-progressive-maxmin").rows[0].status, "partial");
});

test("proportional baseline is computed and honest when equal", () => {
  assert.deepEqual(kits(computePlan(120, three(40), abc(), {}, "hamilton-proportional").rows), { A: 40, B: 40, C: 40 });
  const t = computePlan(100, [center("CTR-A", 10), center("CTR-B", 60), center("CTR-C", 60)], abc(), {}, "hamilton-proportional");
  assert.equal(t.totalAllocatedKits, 100, "capped leftovers are redistributed");
});

test("committed dispatches combine the imported baseline with ledger dispatches", () => {
  const centers = [center("CTR-A", 60, { committedDispatches: 15 }), center("CTR-B", 40)];
  assert.deepEqual(committedByCenter(centers, ledger(mv("CTR-A", "dispatch", 5), mv("CTR-B", "dispatch", 40), mv("CTR-B", "receipt", 35), mv("CTR-X", "dispatch", 9))), { "CTR-A": 20, "CTR-B": 40 });
});

test("reconciliation golden: 40 dispatched, 35 received, 25 collected", () => {
  const s = summarizeCenterLedger("CTR-B", ledger(mv("CTR-B", "dispatch", 40), mv("CTR-B", "receipt", 35), mv("CTR-B", "collection", 25)));
  assert.equal(s.unresolvedKits, 5, "unexplained, not silently 'in transit'"); assert.equal(s.inTransitKits, 0);
  assert.equal(s.dispatchBalanced, false); assert.equal(s.remainingInCenterKits, 10); assert.equal(s.centerBalanced, true);
  const explained = summarizeCenterLedger("CTR-B", ledger(mv("CTR-B", "dispatch", 40), mv("CTR-B", "receipt", 35), mv("CTR-B", "in_transit", 5)));
  assert.equal(explained.unresolvedKits, 0); assert.equal(explained.inTransitKits, 5); assert.equal(explained.dispatchBalanced, true);
  const lost = summarizeCenterLedger("CTR-B", ledger(mv("CTR-B", "dispatch", 40), mv("CTR-B", "receipt", 35), mv("CTR-B", "transit_loss", 5)));
  assert.equal(lost.unresolvedKits, 0); assert.equal(lost.confirmedLossKits, 5);
  const returned = summarizeCenterLedger("CTR-B", ledger(mv("CTR-B", "dispatch", 10), mv("CTR-B", "receipt", 10), mv("CTR-B", "return", 4), mv("CTR-B", "center_damage", 1)));
  assert.equal(returned.returnedKits, 4); assert.equal(returned.remainingInCenterKits, 5);
  assert.equal(summarizeCenterLedger("CTR-A", []).receivedKits, null, "missing receipt is not zero");
});

test("impossible movements are refused before they enter the ledger", () => {
  const history = ledger(mv("CTR-B", "dispatch", 40), mv("CTR-B", "receipt", 35), mv("CTR-B", "collection", 25));
  const check = (movementType: MovementRecord["movementType"], quantityKits: number, headroom = 0) => checkMovement({ centerId: "CTR-B", movementType, quantityKits }, history, headroom);
  assert.equal(check("collection", 10).ok, true); assert.equal(check("collection", 11).ok, false);
  assert.match(check("collection", 11).message!, /only 10 kits are at the center/);
  assert.equal(check("receipt", 5).ok, true); assert.equal(check("receipt", 6).ok, false);
  assert.match(check("receipt", 6).message!, /only 5 kits are between the warehouse and the center/);
  assert.equal(check("transit_loss", 6).ok, false); assert.equal(check("in_transit", 6).ok, false); assert.equal(check("in_transit", 0).ok, true);
  assert.equal(check("center_damage", 11).ok, false); assert.equal(check("return", 10).ok, true);
  for (const q of [0, -1, 1.5, NaN]) assert.equal(check("receipt", q).ok, false, String(q));
  assert.equal(checkMovement({ centerId: "CTR-A", movementType: "receipt", quantityKits: 1 }, history, 0).ok, false, "nothing was dispatched to A");
  assert.equal(check("dispatch", 5, 5).ok, true); assert.equal(check("dispatch", 6, 5).ok, false);
  assert.match(check("dispatch", 6, 5).message!, /exceeds the 5 kits still reserved/);
});

test("dispatch headroom is the published reservation minus what was already dispatched", () => {
  const regions = abc();
  assert.equal(dispatchHeadroom("CTR-B", regions, { A: 40, B: 40, C: 40 }, { "CTR-B": 40 }), 0);
  assert.equal(dispatchHeadroom("CTR-A", regions, { A: 40, B: 40, C: 40 }, { "CTR-A": 15 }), 25);
  assert.equal(dispatchHeadroom("CTR-Z", regions, { A: 40 }, {}), 0, "a center with no region has nothing reserved");
});

test("CSV export quotes every cell and neutralises formulas", () => {
  const csv = toSafeCsv([["id", "name"], ["=1+1", 'Hub, "North"'], ["-2", "@SUM(A1)"], [" +3", 7]]);
  assert.equal(csv, '"id","name"\r\n"\'=1+1","Hub, ""North"""\r\n"\'-2","\'@SUM(A1)"\r\n"\' +3","7"\r\n');
});

test("intake keeps capacity, closure and prior dispatches, and rejects shared centers", () => {
  const rows = [
    { regionId: "UP-LKO", regionName: "Lucknow", centerId: "CTR-LKO", demandKits: 936, capacityKits: 820, priorDispatchedKits: 150, status: "open" as const },
    { regionId: "MH-GAD", regionName: "Gadchiroli", centerId: "CTR-GAD", demandKits: 198, capacityKits: 0, priorDispatchedKits: 0, status: "closed" as const },
  ];
  const { regions, centers } = intakeToEntities(rows, [center("CTR-LKO", 1, { centerName: "Lucknow Depot" })]);
  assert.deepEqual(centers.map(c => [c.centerId, c.centerName, c.configuredCapacity, c.committedDispatches, c.operatingStatus]),
    [["CTR-LKO", "Lucknow Depot", 820, 150, "active"], ["CTR-GAD", "Gadchiroli distribution center", 0, 0, "closed"]]);
  const plan = computePlan(1000, centers, regions, committedByCenter(centers, []), "srs-progressive-maxmin");
  assert.deepEqual(plan.issues, []); assert.equal(plan.rows[0].allocatedKits, 820); assert.equal(plan.rows[1].status, "unserviceable");
  assert.equal(intakeIssues([...rows, { ...rows[0], regionId: "UP-X" }])[0].code, "SHARED_CENTER");
});
