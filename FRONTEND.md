# FairShare — Frontend Technical Specification & Implementation Guide
**Document Version:** 1.0.0  
**Target Milestone:** Hackathon Production Baseline / Hour 12 Decision Loop  
**Source Baseline:** `FairShare_Final_Technical_Plan.pdf` (v3) & Senior Architecture Review  

---

## 1. Executive Summary & Design Philosophy

**FairShare** is an auditable, high-precision decision-support platform designed for humanitarian and school lunch food allocation under severe scarcity.

### The Core Operational Loop
FairShare is **not** a generic CRUD inventory dashboard. The application is built entirely around an auditable decision loop:
1. **Intake**: Coordinator loads demand, stock, and distribution center capacity.
2. **Compute**: The system calculates a mathematically fair allocation using the progressive max-min fairness policy.
3. **Simulate**: The coordinator experiments with real-world constraints (e.g. road closures, damaged storage, surges) on an interactive **Practice Desk**.
4. **Explain**: The system visually explains the *impact* of those changes (Before vs. After, who gained, who lost, changes in minimum coverage).
5. **Accept**: The coordinator commits a reviewed plan with an explicit justification and idempotency key.
6. **Register**: The server re-evaluates the plan against authoritative state and issues an immutable, cryptographically fingerprinted **Decision Receipt**.
7. **Reconcile**: Dispatched food is tracked across two distinct accounting layers (in-transit vs. center inventory) without punitive bias.

### Two Levels of Authority
* **The Browser is the Practice Desk**: Runs uncommitted local previews using an in-memory pure calculation engine for instant `< 50ms` tactile feedback. A preview is **never** a reservation.
* **The Server is the Referee**: Hono / Cloudflare Workers re-authenticates the user, verifies tenant context, and independently re-runs the calculation from authoritative PostgreSQL records.
* **PostgreSQL is the Official Register**: Serializes state using `SELECT ... FOR UPDATE` locks on period rows, rejects stale revisions (HTTP 409), and appends immutable decision receipts.

---

## 2. Technology Stack & Frontend Standards

### 2.1 Core Stack
* **Framework:** React 18 + Vite + TypeScript (Strict Mode enabled).
* **State & Data Fetching:** `@tanstack/react-query` (TanStack Query v5) for server state caching, invalidation, and polling.
* **Validation & Schemas:** `zod` (v3) shared between client CSV pre-flight checks and server API boundary.
* **Styling:** Tailwind CSS with `@tailwindcss/forms`.
* **Icons:** `lucide-react` (16px and 20px, stroke width 1.75px). Strictly **NO EMOJIS** anywhere in the interface.
* **Typography:**
  * **Headings & Interface Body:** **Geist Sans** (or system neo-grotesque: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). **Do NOT use Inter.**
  * **Numbers, Ratios & Ledger IDs:** **JetBrains Mono** (`font-mono tabular-nums`). Guarantees zero horizontal jitter during slider dragging and ensures cryptographic hashes/fractions align.

### 2.2 Design System Tokens
* **Neutrals (Zinc Scale):**
  * Canvas Background: `bg-zinc-50` (`#FAFAFA`)
  * Elevated Card / Surface: `bg-white` (`#FFFFFF`)
  * Subtle Structural Borders: `border-zinc-200` (`#E4E4E7`)
  * Muted Foreground: `text-zinc-500` (`#71717A`)
  * Primary Text / Headings: `text-zinc-900` (`#18181B`)
* **Brand & Action (Emerald Scale):**
  * Primary Button / Authoritative Indicator: `bg-emerald-600 hover:bg-emerald-700 text-white`
  * Active Selection / Subtle Fill: `bg-emerald-50 text-emerald-800 border-emerald-200`
* **Semantic Status Indicators:**
  * **Authoritative / Fully Allocated:** `text-emerald-700 bg-emerald-50 border-emerald-200`
  * **Capacity Constrained / Partial:** `text-amber-700 bg-amber-50 border-amber-200`
  * **Unmet Deficit / Critical Need:** `text-rose-700 bg-rose-50 border-rose-200`
  * **Closed / Inactive / Zero Demand:** `text-zinc-500 bg-zinc-100 border-zinc-200`
* **Layout Discipline:**
  * Avoid "card-soup". Group related controls using clean whitespace, 1px horizontal dividers (`divide-y divide-zinc-200`), and semantic section headers instead of wrapping every label in a card.
  * Maximum visual priority must be given to the **Allocation Matrix**.

### 2.3 Performance Budgets (Release Evidence)
* Main-thread preview calculation: `< 50 ms` for 100 centers.
* Preview recalculation 95th percentile: `p95 < 100 ms`.
* Initial JavaScript bundle: `< 200 KB` gzipped.
* Print reports formatted via `@media print` CSS rules (zero external PDF generation libraries).

---

## 3. Domain Model & TypeScript Data Contracts

All interfaces must reside in `src/domain/types.ts`.

```typescript
// ==========================================
// 1. Core Identifiers & Value Types
// ==========================================
export type OrganizationId = string;
export type PeriodId = string;
export type RegionId = string;
export type CenterId = string;
export type RevisionNumber = number; // e.g. 1, 2, 3...
export type Rational = { numerator: bigint; denominator: bigint };

export type UserRole = 'coordinator' | 'operator' | 'reviewer';

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: OrganizationId;
  organizationName: string;
}

// ==========================================
// 2. Physical & Demand Entities
// ==========================================
export interface RegionDemand {
  regionId: RegionId;
  regionName: string;
  demandKits: number;
  assignedCenterId: CenterId;
  status: 'active' | 'closed';
}

export interface DistributionCenter {
  centerId: CenterId;
  centerName: string;
  configuredCapacity: number;     // Physical maximum handling limit
  committedDispatches: number;    // Already physically shipped (immutable in current period)
  operatingStatus: 'active' | 'constrained' | 'closed';
}

export interface PeriodState {
  periodId: PeriodId;
  periodName: string;
  startDate: string; // ISO 8601 UTC
  endDate: string;   // ISO 8601 UTC
  currentRevision: RevisionNumber;
  confirmedStock: number;         // Authoritative stock in warehouse
  hypotheticalSurgeStock: number; // Staged in Practice Desk (never auto-reserved)
  regions: Record<RegionId, RegionDemand>;
  centers: Record<CenterId, DistributionCenter>;
}

// ==========================================
// 3. Allocation Engine Contracts
// ==========================================
export type AllocationAlgorithmType = 'srs-progressive-maxmin' | 'hamilton-proportional';

export interface RegionAllocationResult {
  regionId: RegionId;
  assignedCenterId: CenterId;
  demandKits: number;
  centerCapacity: number;
  allocatedKits: number;
  coverageRatio: Rational;         // Exact rational fraction (e.g. 40/60)
  coveragePercentage: number;      // Display only: (allocatedKits / demandKits) * 100
  isCappedByCapacity: boolean;
  isCappedByDemand: boolean;
  status: 'full' | 'partial' | 'capped' | 'zero_demand' | 'closed';
}

export interface PlanCalculationOutput {
  algorithm: AllocationAlgorithmType;
  algorithmVersion: string;
  totalStockAvailable: number;
  totalAllocatedKits: number;
  totalUnmetDemandKits: number;
  allocations: Record<RegionId, RegionAllocationResult>;
  summary: {
    averageCoveragePct: number;
    minCoveragePct: number;
    activeRegionsCount: number;
    constrainedCentersCount: number;
  };
}

// ==========================================
// 4. Authoritative Decision Receipt
// ==========================================
export interface DecisionReceipt {
  receiptId: string;               // Server-generated e.g. "rcpt_8f92a10b"
  periodId: PeriodId;
  revision: RevisionNumber;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  timestampUTC: string;
  timestampIST: string;
  algorithm: AllocationAlgorithmType;
  algorithmVersion: string;
  changeJustification: string;
  canonicalPayloadHash: string;   // SHA-256 over deterministic canonical JSON
  stagedOverrides: {
    capacityOverrides: Record<CenterId, number>;
    statusOverrides: Record<CenterId, 'active' | 'closed'>;
    confirmedStockOverride?: number;
  };
  resultingAllocation: Record<RegionId, number>;
}

// ==========================================
// 5. Two-Layer Movement & Reconciliation
// ==========================================
export type MovementEventType = 
  | 'dispatch'       // Central Warehouse -> Center
  | 'receipt'        // Arrived at Center
  | 'collection'     // Distributed to Household
  | 'loss_transit'   // Confirmed spoiled or stolen in transit
  | 'loss_center'    // Confirmed damaged at center
  | 'return';        // Returned from center to central

export interface MovementEvent {
  eventId: string;
  timestampUTC: string;
  periodId: PeriodId;
  centerId: CenterId;
  eventType: MovementEventType;
  quantityKits: number;
  referenceDoc: string;
  notes?: string;
  recordedBy: string;
}

export interface DispatchReconciliationSummary {
  centerId: CenterId;
  dispatchedKits: number;
  receivedKits: number;
  inTransitKits: number;
  confirmedLossKits: number;
  unresolvedKits: number; // dispatched - (received + inTransit + loss)
  isBalanced: boolean;
}

export interface CenterReconciliationSummary {
  centerId: CenterId;
  receivedKits: number;
  collectedKits: number;
  damagedKits: number;
  remainingInCenterKits: number; // received - (collected + damaged)
  isBalanced: boolean;
}
```

---

## 4. Mathematics & Golden Test Fixtures

### 4.1 SRS Progressive Max-Min Algorithm (`src/domain/srsMaxMin.ts`)
* **Policy Mandate:** Protect the most underserved communities first (leximin fairness).
* **Exact Arithmetic:** All internal coverage comparisons **must** use integer cross-products via JavaScript `BigInt`:
  $$\frac{a}{b} < \frac{c}{d} \iff \text{BigInt}(a) \times \text{BigInt}(d) < \text{BigInt}(c) \times \text{BigInt}(b)$$
* **Reference Iteration Step:**
  1. Determine the set of *eligible, uncapped regions*:
     - Region is `active` (not closed).
     - Region demand $> 0$.
     - Current allocation $<$ demand.
     - Assigned center allocation $<$ effective center capacity.
  2. From eligible regions, identify those with the **strictly lowest current coverage fraction**.
  3. **Tie-breaking rule:** If multiple regions share the lowest coverage:
     - Prefer the region that achieves the larger next coverage fraction after receiving 1 kit.
     - If still tied, break deterministically by alphabetical order of `regionId`.
  4. Allocate 1 kit. Repeat until available stock is exhausted or all eligible regions are capped.

### 4.2 Hamilton Largest Remainder Baseline (`src/domain/hamiltonBaseline.ts`)
* **Policy Mandate:** Capacity-aware proportional representation.
* Floor rational shares $\lfloor \text{Stock} \times \frac{\text{Demand}_i}{\text{Total Demand}} \rfloor$, capped by center capacity.
* Distribute remaining kits one-by-one in descending order of the fractional remainder, with ties broken by `regionId`.

### 4.3 Five Mandatory Deterministic Scenarios
Every scenario button in the UI **resets all variables** to known states rather than inheriting accidental slider mutations:

| Preset Name | Total Stock | Region Demands [A, B, C] | Center Capacities [A, B, C] | Expected Output [A, B, C] | Core System Behavior Demonstrated |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Golden Baseline** | 120 | [60, 60, 60] | [60, 40, 60] | **[40, 40, 40]** | Equal sharing under scarcity; B matches A and C. |
| **2. B Throttled** | 120 | [60, 60, 60] | [60, **20**, 60] | **[50, 20, 50]** | B hits capacity bound; remaining stock shifts fairly to A and C. |
| **3. Stock Surge (+20)** | 140 *(120+20)* | [60, 60, 60] | [60, **20**, 60] | **[60, 20, 60]** | B remains throttled at 20; A and C fully satisfied (100%). |
| **4. Restore Center B** | 120 | [60, 60, 60] | [60, **40**, 60] | **[40, 40, 40]** | Fully reverts to baseline; proves reversibility. |
| **5. Emergency Closure** | 120 | [60, 60, 60] | [60, 40, **0 (Closed)**] | **[60, 40, 0]** | Region C closed (`N/A coverage`); cannot block flow to A and B. |

---

## 5. Screen-by-Screen UI Specifications

### 5.1 Global App Header & Command Bar (`src/components/layout/AppHeader.tsx`)
* **Left:** Product branding `FairShare` with pill badge `v3.1 Production Baseline`.
* **Center Controls:**
  * **Organization Switcher:** Dropdown displaying current authorized tenant (`Mumbai Central Relief - Org #A41`).
  * **Period Indicator:** Badge displaying `Period 2026-W46 (Nov 10 – Nov 16)`.
  * **Authority Pill:**
    * If local state == server state: `Authoritative Register • Revision r4` (Emerald border/pill).
    * If local state != server state: `Uncommitted Practice Preview` (Amber border/pill).
* **Right Controls:**
  * Network Latency indicator (`Mumbai Pooler: 28ms`).
  * User Identity badge: `Swayam` with role badge `Coordinator`.
  * Quick Role Switcher for hackathon demo (`Coordinator`, `Operator`, `Reviewer`).

---

### 5.2 Screen 1: The Practice Desk (`src/views/PracticeDeskView.tsx`)

#### A. Top KPI Ribbon (Distinguishing Physical vs. Staged)
Four clean KPI blocks separated by vertical borders (no separate card wrappers):
1. **CONFIRMED STOCK:**
   * Value: `120 kits`
   * Subtext: `Physical inventory in register`
   * *Surge Tag:* If user drags stock above 120, shows `+20 HYPOTHETICAL (UNCONFIRMED)` in amber.
2. **PLAN RESERVED:**
   * Value: `120 / 120 kits`
   * Progress Bar: 100% filled in emerald.
3. **UNMET DEMAND:**
   * Value: `60 kits`
   * Subtext: `Total regional deficit`
4. **OPERATIONAL CENTERS:**
   * Value: `3 / 3 active`
   * Subtext: `0 closed / 1 capacity-constrained`

#### B. Allocation Matrix (Visual Hero Component)
Full-width primary table occupying the top half of the workspace:
* **Columns:**
  1. `Region`: Region Name + Region ID in JetBrains Mono.
  2. `Assigned Center`: Center ID + operating status badge.
  3. `Demand`: Target kits (`60`).
  4. `Center Capacity`: Configured physical limit (`40`).
  5. `Allocated Kits`: Exact kits awarded (`40`).
  6. `Exact Coverage Fraction`: Rendered in JetBrains Mono (`40/60`).
  7. `Coverage %`: Percentage with tabular digits (`66.7%`).
  8. `Constraint Status`: Badges (`Full 100%`, `Capped by Capacity`, `Fair Max-Min Share`, `Closed`).

#### C. Prominent Allocation Impact Section (Before vs. After)
Rendered immediately below the matrix whenever local edits exist:
* Displays a clear comparison table:
  * `Region A`: `40 → 50 kits` (+10 kits, coverage `66.7% → 83.3%`)
  * `Region B`: `40 → 20 kits` (-20 kits, coverage `66.7% → 33.3%`)
  * `Region C`: `40 → 50 kits` (+10 kits, coverage `66.7% → 83.3%`)
* Impact Summary chips:
  * Minimum Coverage: `66.7% → 33.3%`
  * Average Coverage: `66.7% → 66.7%`
  * Severely Underserved Regions: `0 → 1 (Region B)`

#### D. Interactive Constraint Controls (Bottom Split Grid)
* **Left Sub-Panel: Scenario Reset Presets:**
  * 5 buttons corresponding to the Five Deterministic Scenarios.
  * Clicking any button resets the sliders and recomputes the preview in `< 50ms`.
* **Right Sub-Panel: Center Capacity Breakdown Cards:**
  * For each center:
    * `Configured Capacity`: Interactive slider (`0` to `100`).
    * Numerical breakdown: `Capacity: 40` | `Dispatched: 0` | `Reserved: 40` | `Remaining Allocatable: 0`.
    * Toggle switch: `Active` vs `Emergency Closed`.

#### E. Staged Action Bar (Bottom Floating Dock)
* If local changes are staged:
  * Shows: `Uncommitted Preview — 2 overrides staged vs Revision r4`.
  * Secondary Button: `Discard All Changes` (reverts to r4).
  * Primary Button: **`Review & Accept Plan`** (opens Modal).

---

### 5.3 Review & Accept Flow Modal (`src/components/modals/ReviewAcceptModal.tsx`)
A non-bypassable modal required before committing any plan:
1. **Target Revision Verification:** Displays `Locking Period 2026-W46 at Revision r4`.
2. **Override Summary:** Shows list of modifications (e.g. `Center B capacity throttled from 40 to 20 kits`).
3. **Hypothetical Stock Guard:** If hypothetical stock > confirmed stock, the modal displays a blocking warning:
   > *"Hypothetical stock cannot become confirmed stock. You must import confirmed warehouse stock before creating a permanent reservation."*
4. **Mandatory Change Justification Input:**
   * Textarea with placeholder: `Explain reason for override (e.g., Highway bridge flooding reduced delivery throughput to Center B)`.
   * Submit button disabled until at least 10 characters are entered.
5. **Idempotency Key:** Displays generated client UUID v4: `Idempotency-Key: b7a1c93e-...`.
6. **Actions:**
   * `Cancel / Return to Desk`
   * `Commit & Register Plan` $\rightarrow$ triggers `POST /api/v1/plans/accept`.
7. **Conflict State Handler (HTTP 409):** If another coordinator advanced the revision to `r5`, the modal displays an inline error:
   > *"Conflict: Revision r4 has been superseded by Revision r5 by Ishaan. Refresh to inspect authoritative changes."*
   > Button: `Refresh from Register`.

---

### 5.4 Screen 2: Data Intake & Multi-CSV Import (`src/views/DataIntakeView.tsx`)
* **Multi-File Ingestion Dropzone:** Supports selecting or dragging:
  1. `centers.csv`: `center_id, name, configured_capacity, status`
  2. `demand.csv`: `region_id, name, demand_kits, assigned_center_id`
  3. `stock.csv`: `period_id, confirmed_stock_kits, warehouse_code`
* **Security: Formula-Injection Sanitizer:**
  * All text cells starting with `=`, `+`, `-`, `@`, or leading control/whitespace characters are safely escaped upon export and flagged during import.
* **Pre-Flight Zod Verification Table:**
  * Shows valid rows in neutral styling.
  * Shows invalid rows with red inline error chips:
    * `Row 3: Negative capacity (-10) rejected`.
    * `Row 7: Assigned center "CTR_99" does not exist`.
* **Provenance Tracking:** Displays file size, SHA-256 hash, and upload timestamp.
* **One-Click Demo Data Loader:** Button: `Load Verified Hackathon Golden Fixtures`.

---

### 5.5 Screen 3: Decision Receipts & Audit Ledger (`src/views/AuditLedgerView.tsx`)
* **Immutable Decision Timeline:** Chronological list of accepted revisions (`r1`, `r2`, `r3`, `r4`).
* **Authoritative Receipt Card:**
  * `Receipt ID`: `rcpt_8f92a10b` (server-generated).
  * `Committed Timestamp`: `10 Nov 2026, 02:15:30 IST` (explicit IST conversion).
  * `Actor`: `Swayam (Coordinator)`.
  * `Algorithm`: `SRS Progressive Max-Min v3.1 (Integer Cross-Product BigInt)`.
  * `Change Justification`: *"Bridge repairs complete, restoring Center B capacity to 40 kits."*
* **Cryptographic Verification Widget:**
  * Canonical JSON hash: `SHA-256: 3c9b740...`
  * Status: `Fingerprint Valid • Tamper-Evident Match`.
* **Revision Diff Viewer:** Side-by-side inspection comparing any two revisions (e.g. `r3` vs `r4`).

---

### 5.6 Screen 4: Two-Layer Reconciliation & Reporting (`src/views/ReconciliationView.tsx`)

#### Layer 1: Dispatch Reconciliation (Warehouse $\rightarrow$ Center)
* **Table Columns:** `Center Name`, `Dispatched`, `Received`, `In Transit`, `Confirmed Loss`, `Unresolved Difference`, `Status`.
* **Formula Enforced:**
  $$\text{Dispatched} = \text{Received} + \text{In Transit} + \text{Confirmed Loss} + \text{Unresolved Difference}$$
* *Accounting Rule:* 5 missing kits without an explanation remain in `Unresolved Difference` until updated.

#### Layer 2: Center Reconciliation (Center $\rightarrow$ Community)
* **Table Columns:** `Center Name`, `Received at Center`, `Collected by Households`, `Damaged at Center`, `Remaining Stock`, `Status`.
* **Formula Enforced:**
  $$\text{Received} = \text{Collected} + \text{Damaged} + \text{Remaining in Center}$$

#### Non-Punitive Ethics Rules (Document Section 04)
* A high `Unresolved` count must **never** be labeled as fraud; it is classified as an operational discrepancy.
* Low household collection **never** automatically reduces future demand allocations.
* Corrections append new compensatory movement events rather than rewriting past rows.

#### Export Actions
* **Export Safe CSV:** Downloads sanitized CSV with formula-injection guard.
* **Print Formal Audit Report:** Triggers `window.print()` using `@media print` styles:
  * Strips navigation, headers, and buttons.
  * Formats clean monochrome tables suitable for administrative review.

---

## 6. API Client & Wire Contracts (`src/services/api.ts`)

The frontend interacts with the Hono API (`/api/v1`) using these exact contracts:

```typescript
// GET /api/v1/periods/:id/snapshot
// Response:
export interface PeriodSnapshotResponse {
  period: PeriodState;
  authoritativePlan: PlanCalculationOutput;
  latestReceipt: DecisionReceipt;
}

// POST /api/v1/plans/accept
// Headers:
//   Authorization: Bearer <jwt>
//   Idempotency-Key: <uuid-v4>
// Request Body:
export interface AcceptPlanRequest {
  periodId: PeriodId;
  expectedRevision: RevisionNumber;
  algorithm: AllocationAlgorithmType;
  changeJustification: string;
  stagedOverrides: {
    capacityOverrides: Record<CenterId, number>;
    statusOverrides: Record<CenterId, 'active' | 'closed'>;
  };
}
// Response (200 OK):
export interface AcceptPlanResponse {
  status: 'committed';
  revision: RevisionNumber;
  receipt: DecisionReceipt;
  updatedPlan: PlanCalculationOutput;
}
// Error Response (409 Conflict):
export interface ConflictErrorResponse {
  error: 'stale_revision';
  currentRevision: RevisionNumber;
  message: string;
}
```

---

## 7. Folder Structure

```
AI_Avengers/frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── common/              # Buttons, Badges, Tabs, Sliders, Modals
│   │   ├── layout/              # AppHeader, NavigationBar, CommandBar
│   │   └── modals/              # ReviewAcceptModal, RoleSwitchModal
│   ├── domain/                  # PURE TYPESCRIPT BUSINESS LOGIC (Zero DOM deps)
│   │   ├── types.ts             # All contracts defined in Section 3
│   │   ├── srsMaxMin.ts         # Exact BigInt Progressive Max-Min
│   │   ├── hamiltonBaseline.ts  # Hamilton Largest Remainder baseline
│   │   ├── scenarios.ts         # 5 Deterministic Scenarios
│   │   ├── reconciliation.ts    # Two-layer accounting calculators
│   │   └── sanitizer.ts         # CSV formula injection prevention
│   ├── hooks/                   # usePeriodSnapshot, useCalculatorPreview
│   ├── services/
│   │   ├── api.ts               # Hono API client (/api/v1)
│   │   └── mockApi.ts           # Offline hackathon fallback simulator
│   ├── views/
│   │   ├── PracticeDeskView.tsx # Flagship what-if studio
│   │   ├── DataIntakeView.tsx   # CSV parser & validator
│   │   ├── AuditLedgerView.tsx  # Decision receipts & SHA-256 diffs
│   │   └── ReconciliationView.tsx # 2-layer accounting & report print
│   ├── App.tsx                  # Root router & query client
│   ├── main.tsx                 # Entrypoint
│   └── index.css                # Tailwind directives & @media print rules
├── index.html                   # Geist + JetBrains Mono fonts loaded
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

---

## 8. Step-by-Step Build & Verification Checklist

1. **Scaffold & Dependencies:** Initialize Vite + React + TypeScript + Tailwind CSS + Lucide Icons + TanStack Query + Zod.
2. **Domain Unit Tests:** Verify `srsMaxMin.ts` against the Golden Fixture:
   * 120 kits $\rightarrow$ `40 / 40 / 40`
   * B throttled to 20 $\rightarrow$ `50 / 20 / 50`
   * Restore B $\rightarrow$ `40 / 40 / 40`
   * Surge +20 $\rightarrow$ `60 / 20 / 60`
3. **Build the Practice Desk:** Implement top KPI ribbon, the hero Allocation Matrix, and the Before/After impact component.
4. **Build the Review & Accept Modal:** Wire up idempotency key generation, revision locking, and the justification requirement.
5. **Build the Two-Layer Reconciliation Screen:** Ensure dispatch and center balances reconcile without double-counting.
6. **Verify Print CSS:** Ensure `@media print` renders clean monochrome audit reports on Ctrl+P.
