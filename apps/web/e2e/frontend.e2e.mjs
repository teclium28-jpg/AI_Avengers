// End-to-end browser test of the FairShare web app. It drives the built app the way the three
// demo users do and checks the numbers the specification fixes (context.md, FRONTEND.md 4.3).
//
//   npm run build -w @fairshare/web && npx vite preview --port 4173   (in apps/web)
//   BASE_URL=http://127.0.0.1:4173 node --test apps/web/e2e/frontend.e2e.mjs
//
// Requires the `playwright` package and a Chromium browser.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173/";
const PASSWORD = process.env.DEMO_PASSWORD ?? "admin@123";

let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser?.close(); });

/** A fresh browser profile signed in as `user`. Collects console errors and page crashes. */
async function session(user, { viewport = { width: 1440, height: 1000 }, storage } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => {
    // The API is not running in this test; its failed health check is expected.
    if (m.type() === "error" && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) problems.push("console: " + m.text());
  });
  await page.goto(BASE);
  if (storage) {
    await page.evaluate((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
    await page.reload();
  }
  if (user) {
    await page.fill('input[placeholder^="e.g. swayam"]', user);
    await page.fill('input[placeholder="Enter access password"]', PASSWORD);
    await page.click("button[type=submit]");
    await page.waitForSelector("header");
    await page.waitForSelector("text=Sign In to Terminal", { state: "detached" });
  }
  const nav = async (label) => { await page.locator("aside nav button", { hasText: label }).click(); };
  const crashed = async () => (await page.locator("text=Session Initialization Recovered").count()) > 0;
  /** Allocation matrix in the studio: { regionId: { allocated, status, prior } }. */
  const matrix = () => page.evaluate(() => {
    const table = [...document.querySelectorAll("table")].find((t) => /Allocated Quota/.test(t.tHead?.textContent ?? ""));
    if (!table) return null;
    const heads = [...table.tHead.querySelectorAll("th")].map((th) => th.textContent.trim());
    const col = (name) => heads.findIndex((h) => h.startsWith(name));
    return Object.fromEntries([...table.tBodies[0].rows].map((tr) => {
      const cells = [...tr.cells].map((td) => td.innerText.trim());
      const id = tr.cells[0].querySelector(".font-mono")?.textContent.trim();
      const num = (s) => Number(s.replace(/[^0-9]/g, "")) || 0;
      return [id, { allocated: num(cells[col("Allocated")]), prior: num(cells[col("Prior")]), status: cells[cells.length - 1], coverage: cells[col("Coverage")] }];
    }));
  });
  const kits = async () => Object.fromEntries(Object.entries(await matrix()).map(([k, v]) => [k, v.allocated]));
  const ledgerRow = async (layerTitle, centerId) => page.evaluate(([title, id]) => {
    const card = [...document.querySelectorAll("h3")].find((h) => h.textContent.includes(title)).closest(".bg-white");
    const tr = [...card.querySelectorAll("tbody tr")].find((r) => r.textContent.includes(`(${id})`));
    return tr ? [...tr.cells].map((c) => c.innerText.trim()) : null;
  }, [layerTitle, centerId]);
  return { page, context, problems, nav, crashed, matrix, kits, ledgerRow };
}

async function openMovementModal(s) {
  await s.page.locator("header button", { hasText: /Record Waybill|Confirm Truck Arrival/ }).first().click();
  await s.page.waitForSelector("text=Record Physical Movement Waybill");
}
async function recordMovement(s, { type, center, quantity }) {
  await openMovementModal(s);
  const modal = s.page.locator("form", { hasText: "Movement Fact Type" });
  await modal.locator("select").nth(0).selectOption(type);
  if (center) await modal.locator("select").nth(1).selectOption(center);
  await modal.locator('input[type="number"]').fill(String(quantity));
  await modal.locator("button[type=submit]").click();
  await s.page.waitForTimeout(150);
  const open = await s.page.locator("text=Record Physical Movement Waybill").count();
  const error = open ? await modal.locator('[role="alert"]').innerText().catch(() => null) : null;
  if (open) await s.page.locator("form", { hasText: "Movement Fact Type" }).locator("button", { hasText: "Cancel" }).click();
  return { recorded: !open, error };
}

test("every page renders for every role without crashes or console errors", async () => {
  const pages = {
    swayam: ["Operations Overview", "Allocation Studio", "Distribution Nodes", "Data Intake & Batching", "Dispatch & Transit Ledger", "Audit Trail & Receipts"],
    sunita: ["Depot Overview (CTR-B)", "Depot Quota & Headroom", "Dharavi Logistics Hub", "Inbound Deliveries & Waybills"],
    farhan: ["Community Aid Overview", "Submit Food Aid Request", "Inbound Supply Shipments", "Fairness Guarantee & Audit"],
  };
  for (const [user, labels] of Object.entries(pages)) {
    const s = await session(user);
    for (const label of labels) { await s.nav(label); assert.equal(await s.crashed(), false, `${user} ${label}`); }
    assert.deepEqual(s.problems, [], user);
    await s.context.close();
  }
});

test("register state: 40/40/40, B's 40 dispatched kits shown, golden reconciliation and verified receipt", async () => {
  const s = await session("swayam");
  await s.nav("Allocation Studio");
  const m = await s.matrix();
  assert.deepEqual(await s.kits(), { A: 40, B: 40, C: 40 });
  assert.equal(m.B.prior, 40, "the seeded 40-kit dispatch to CTR-B is a commitment");
  assert.equal(m.B.status, "Hub Bound");
  await s.nav("Dispatch & Transit Ledger");
  const layer1 = await s.ledgerRow("Layer 1", "CTR-B");
  assert.deepEqual(layer1.slice(1), ["40", "35", "0", "0", "5 kits", "Needs Review"], "40 dispatched, 35 received: 5 unresolved, not 'in transit'");
  const layer2 = await s.ledgerRow("Layer 2", "CTR-B");
  assert.equal(layer2[layer2.length - 2], "10 kits", "35 received - 25 collected");
  assert.equal((await s.ledgerRow("Layer 1", "CTR-A"))[2], "Not reported", "missing receipt is not zero");
  await s.nav("Audit Trail & Receipts");
  await s.page.waitForSelector("text=Fingerprint Match");
  await s.nav("Operations Overview");
  assert.match(await s.page.innerText("body"), /5 dispatched kits are not yet explained/);
  assert.doesNotMatch(await s.page.innerText("body"), /fraud|theft/i);
  await s.context.close();
});

test("the five deterministic presets give the specified allocations and cannot be published", async () => {
  const s = await session("swayam");
  await s.nav("Allocation Studio");
  const expected = { "1. Golden baseline": { A: 40, B: 40, C: 40 }, "2. B throttled to 20": { A: 50, B: 20, C: 50 },
    "3. Stock surge +20": { A: 60, B: 20, C: 60 }, "4. Restore B": { A: 40, B: 40, C: 40 }, "5. Close center C": { A: 60, B: 40, C: 0 } };
  for (const [label, allocation] of Object.entries(expected)) {
    await s.page.locator("button", { hasText: label }).click();
    assert.deepEqual(await s.kits(), allocation, label);
  }
  assert.equal((await s.matrix()).C.status, "Center Closed");
  assert.match(await s.page.innerText("body"), /Scenario preview: models the period before any dispatch/);
  await s.page.locator("button", { hasText: /Commit Plan/ }).click();
  assert.match(await s.page.innerText("form"), /scenario preset/i);
  assert.equal(await s.page.locator("button", { hasText: /^\s*Publish Revision r2/ }).last().isDisabled(), true);
  assert.deepEqual(s.problems, []);
  await s.context.close();
});

test("coordinator changes capacity, publishes once, and the receipt verifies", async () => {
  const s = await session("swayam");
  await s.nav("Allocation Studio");
  await s.page.locator('button[title="Click to adjust center capacity"]').first().click();
  await s.page.fill('input[aria-label="Capacity for CTR-A"]', "30");
  await s.page.locator("button", { hasText: /^Save$/ }).click();
  assert.deepEqual(await s.kits(), { A: 30, B: 40, C: 50 });
  // Below what was already dispatched is refused, not a crash.
  await s.page.locator('button[title="Click to adjust center capacity"]').nth(1).click();
  await s.page.fill('input[aria-label="Capacity for CTR-B"]', "30");
  await s.page.locator("button", { hasText: /^Save$/ }).click();
  assert.match(await s.page.locator('[role="alert"]').first().innerText(), /40 kits were already dispatched/);
  await s.page.keyboard.press("Escape");
  await s.page.locator("button", { hasText: /Commit Plan/ }).click();
  const form = s.page.locator("form", { hasText: "Regulatory Decision Justification" });
  assert.match(await form.innerText(), /capacity 60 → 30 kits/);
  const key1 = await form.locator("text=/[0-9a-f]{8}-[0-9a-f]{4}-/").innerText();
  await form.locator("textarea").fill("SYNTHETIC road works at Bhiwandi reduce handling to 30 kits");
  const publish = form.locator("button[type=submit]");
  await publish.dblclick();
  await s.page.waitForSelector("text=Official Register r2");
  await s.nav("Audit Trail & Receipts");
  assert.match(await s.page.innerText("body"), /Published Revisions \(2\)/i, "double click created exactly one revision");
  await s.page.waitForSelector("text=Fingerprint Match");
  await s.nav("Operations Overview");
  assert.match(await s.page.innerText("main"), /30 kits/);
  // A new acceptance intent gets a new idempotency key.
  await s.nav("Allocation Studio");
  await s.page.locator("button", { hasText: /Commit Plan/ }).click();
  const key2 = await s.page.locator("form", { hasText: "Regulatory Decision Justification" }).locator("text=/[0-9a-f]{8}-[0-9a-f]{4}-/").innerText();
  assert.notEqual(key1, key2);
  assert.equal(await s.page.locator("form textarea").inputValue(), "", "justification is not carried over");
  await s.context.close();
});

test("hypothetical stock and closing a center after dispatch are handled safely", async () => {
  const s = await session("swayam");
  await s.nav("Allocation Studio");
  await s.page.locator("button", { hasText: /^Adjust$/ }).click();
  await s.page.fill('input[aria-label="Stock for this preview"]', "1.5");
  await s.page.locator("button", { hasText: "Apply New Pool" }).click();
  assert.match(await s.page.locator('[role="alert"]').first().innerText(), /whole, non-negative/);
  await s.page.fill('input[aria-label="Stock for this preview"]', "140");
  await s.page.locator("button", { hasText: "Apply New Pool" }).click();
  assert.match(await s.page.innerText("main"), /\+20 hypothetical \(confirmed: 120\)/);
  await s.page.locator("button", { hasText: /Commit Plan/ }).click();
  assert.match(await s.page.innerText("form"), /Hypothetical stock cannot become confirmed stock/);
  assert.equal(await s.page.locator("form button[type=submit]").isDisabled(), true);
  await s.page.locator("form button", { hasText: "Cancel" }).click();
  // Close CTR-B, which already received a 40-kit dispatch.
  await s.page.locator("button", { hasText: /Reset to register/ }).click();
  await s.nav("Distribution Nodes");
  await s.page.locator('button[title^="Toggle operating status"]').nth(1).click();
  await s.nav("Allocation Studio");
  assert.equal(await s.crashed(), false);
  const m = await s.matrix();
  assert.equal(m.B.allocated, 40, "dispatched kits stay committed"); assert.equal(m.B.status, "Center Closed");
  assert.equal(m.A.allocated + m.C.allocated, 80);
  assert.deepEqual(s.problems, []);
  await s.context.close();
});

test("statewide scenario and data intake keep capacities, closures and prior dispatches", async () => {
  const s = await session("swayam");
  await s.nav("Allocation Studio");
  await s.page.locator("button", { hasText: "Statewide (30 Districts)" }).click();
  const m = await s.matrix();
  assert.equal(Object.keys(m).length, 30);
  assert.equal(m["MH-GAD"].status, "Center Closed"); assert.equal(m["UP-LKO"].prior, 150);
  assert.equal(m["KL-TVM"].status, "Zero Demand (N/A)"); assert.equal(m["KL-TVM"].coverage, "N/A");
  assert.ok(Object.values(m).filter((r) => r.allocated > 0).length >= 25, "districts receive kits");
  await s.nav("Data Intake & Batching");
  assert.match(await s.page.innerText("main"), /30 district records and 15,520 confirmed stock kits passed/);
  await s.page.locator("button", { hasText: "Test Data Cleansing Rules" }).click();
  assert.match(await s.page.innerText("main"), /Integrity Validation Failed/);
  await s.page.locator("button", { hasText: "Load Metropolitan Benchmark" }).click();
  await s.page.locator("button", { hasText: "Apply to Allocation Planner" }).click();
  assert.deepEqual(await s.kits(), { A: 40, B: 40, C: 40 });
  await s.page.locator("button", { hasText: /Commit Plan/ }).click();
  assert.doesNotMatch(await s.page.innerText("form"), /cannot become confirmed|scenario preset/i, "imported confirmed data is publishable");
  await s.context.close();
});

test("movement reports: impossible facts refused, reservations enforced, explanations clear the gap", async () => {
  const s = await session("swayam");
  assert.match((await recordMovement(s, { type: "collection", center: "CTR-B", quantity: 11 })).error, /only 10 kits are at the center/);
  assert.match((await recordMovement(s, { type: "receipt", center: "CTR-B", quantity: 6 })).error, /only 5 kits are between/);
  assert.match((await recordMovement(s, { type: "dispatch", center: "CTR-B", quantity: 1 })).error, /exceeds the 0 kits still reserved/);
  assert.equal((await recordMovement(s, { type: "dispatch", center: "CTR-A", quantity: 15 })).recorded, true);
  assert.equal((await recordMovement(s, { type: "in_transit", center: "CTR-B", quantity: 5 })).recorded, true);
  await s.nav("Dispatch & Transit Ledger");
  assert.deepEqual((await s.ledgerRow("Layer 1", "CTR-B")).slice(1), ["40", "35", "5", "0", "0 kits", "Reconciled"]);
  await s.nav("Allocation Studio");
  assert.equal((await s.matrix()).A.prior, 15, "a ledger dispatch becomes a commitment exactly once");
  // A new opening gets a new waybill number.
  await openMovementModal(s);
  const w1 = await s.page.locator("form", { hasText: "Movement Fact Type" }).locator('input[type="text"]').first().inputValue();
  await s.page.locator("form", { hasText: "Movement Fact Type" }).locator("button", { hasText: "Cancel" }).click();
  await openMovementModal(s);
  const w2 = await s.page.locator("form", { hasText: "Movement Fact Type" }).locator('input[type="text"]').first().inputValue();
  assert.notEqual(w1, w2);
  assert.deepEqual(s.problems, []);
  await s.context.close();
});

test("operator and community partner are limited to their own scope", async () => {
  const op = await session("sunita");
  await openMovementModal(op);
  const form = op.page.locator("form", { hasText: "Movement Fact Type" });
  const types = await form.locator("select").nth(0).locator("option").evaluateAll((o) => o.map((x) => x.value));
  assert.ok(!types.includes("dispatch"), "operators never dispatch");
  assert.equal(await form.locator("select").nth(1).isDisabled(), true);
  assert.equal(await form.locator("select").nth(1).inputValue(), "CTR-B");
  await form.locator("button", { hasText: "Cancel" }).click();
  await op.nav("Depot Quota & Headroom");
  assert.equal(await op.page.locator('button[title="Click to adjust center capacity"]').count(), 1, "only CTR-B is editable");
  await op.nav("Dharavi Logistics Hub");
  const toggles = op.page.locator('button[title], button[disabled]').filter({ hasText: /Active|Closed/ });
  assert.equal(await toggles.evaluateAll((b) => b.filter((x) => !x.disabled).length), 1);
  await op.nav("Depot Overview (CTR-B)");
  assert.equal(await op.page.locator("button", { hasText: "Import CSV Batch" }).count(), 0);
  assert.equal(await op.page.locator("button", { hasText: "Inspect Audit Receipts" }).count(), 0);
  await op.context.close();

  const ngo = await session("farhan");
  await ngo.nav("Community Aid Overview");
  for (const forbidden of ["Import CSV Batch", "Open Studio"]) assert.equal(await ngo.page.locator("button", { hasText: forbidden }).count(), 0, forbidden);
  await ngo.nav("Submit Food Aid Request");
  const kitsInput = ngo.page.locator('input[type="number"]').nth(1);
  await kitsInput.fill("75");
  await ngo.page.locator("button[type=submit]").click();
  assert.match(await ngo.page.innerText("main"), /Request submitted for review/);
  assert.match(await ngo.page.innerText("main"), /75 kits · .*pending/is);
  assert.match(await ngo.page.innerText("main"), /40 Kits/, "published quota is unchanged until a coordinator acts");
  // The same browser profile, now as the coordinator.
  await ngo.page.locator("header button", { hasText: "Dr. Farhan" }).click();
  await ngo.page.locator("button", { hasText: /Sign Out|Log ?out/i }).click();
  await ngo.page.fill('input[placeholder^="e.g. swayam"]', "swayam");
  await ngo.page.fill('input[placeholder="Enter access password"]', PASSWORD);
  await ngo.page.click("button[type=submit]");
  await ngo.page.waitForSelector("text=Community Aid Requests (1 pending)");
  await ngo.page.locator("button", { hasText: "Stage as demand" }).click();
  const staged = await ngo.matrix();
  assert.equal(staged.B.allocated, 40); assert.match(await ngo.page.innerText("main"), /75/);
  assert.deepEqual([...ngo.problems], []);
  await ngo.context.close();
});

test("corrupted saved data falls back to seeds instead of crashing", async () => {
  const s = await session(null, { storage: { fairshare_auth_user: JSON.stringify({ id: "swayam" }), fairshare_revision: "NaN", fairshare_stock: "-5", fairshare_centers: "{not json", fairshare_regions: JSON.stringify([{ regionId: 1 }]), fairshare_movements: "[null]", fairshare_receipts: "\"x\"" } });
  await s.page.waitForSelector("aside nav");
  await s.nav("Allocation Studio");
  assert.equal(await s.crashed(), false);
  assert.deepEqual(await s.kits(), { A: 40, B: 40, C: 40 });
  await s.context.close();
});

test("phone-width layout has no horizontal page scroll", async () => {
  const s = await session("swayam", { viewport: { width: 390, height: 844 } });
  const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `page overflows by ${overflow}px`);
  await s.context.close();
});
