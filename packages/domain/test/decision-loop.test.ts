import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import fc from 'fast-check';
import { interventionFrontier, reconcile, computeDecision, replayDecision, fingerprint, csvCell, exportDecisionHtml } from '../src/index.ts';
import type { PeriodInput, LedgerEvent, AuthoritativeSnapshot } from '../src/index.ts';

const seed=Number(process.env.FAIRSHARE_SEED??randomInt(1,2147483647));
const parameters={seed,numRuns:300,verbose:true as const};
console.log(JSON.stringify({generator:'decision-loop/1',seed,runsPerProperty:300,shrinking:true,synthetic:true}));
const makeInput=(rows:{demand:number;capacity:number}[],stock:number):PeriodInput=>({periodId:'synthetic-'+randomUUID(),stockKits:stock,regions:rows.map((r,i)=>({periodId:'',regionId:'generated-'+i,regionName:'SYNTHETIC '+i,centerId:'center-'+i,demandKits:r.demand,capacityKits:r.capacity,priorDispatchedKits:0,status:'open',provenance:'simulated'}))});
function input(rows:{demand:number;capacity:number}[],stock:number){const v=makeInput(rows,stock);for(const r of v.regions)r.periodId=v.periodId;return v;}
// Independent tiny specification model: enumerate every eligible next kit,
// compare exact integer cross-products, then take the earliest policy event.
function expected(v:PeriodInput){const counts=v.regions.map(r=>r.priorDispatchedKits);let left=v.stockKits-counts.reduce((a,b)=>a+b,0);
  while(left-->0){const eligible=v.regions.map((r,i)=>({r,i})).filter(({r,i})=>r.status==='open'&&counts[i]<Math.min(r.demandKits,r.capacityKits));
    eligible.sort((a,b)=>counts[a.i]*b.r.demandKits-counts[b.i]*a.r.demandKits || (counts[b.i]+1)*a.r.demandKits-(counts[a.i]+1)*b.r.demandKits || (a.r.regionId<b.r.regionId?-1:1));
    if(!eligible.length)break;counts[eligible[0].i]++;}return counts;}

test('fresh bounded frontier agrees with independent enumeration and Pareto objectives',()=>{
  let scenarios=0;const diversity=new Set<string>();
  fc.assert(fc.property(fc.array(fc.record({demand:fc.integer({min:1,max:13}),capacity:fc.integer({min:0,max:13})}),{minLength:1,maxLength:4}),fc.integer({min:0,max:27}),fc.integer({min:1,max:7}), (rows,stock,increment)=>{
    const v=input(rows,stock),domain={stockIncrements:[increment,increment+1],capacityIncrements:v.regions.map(r=>({centerId:r.centerId,kits:increment})),includeCombined:true,target:{usefulKits:stock+1}};
    const result=interventionFrontier(v,domain);assert.ok(result.ok);assert.equal(result.complete,true);
    const objectives=result.results.map(c=>{
      const counts=expected(c.changedInput);assert.deepEqual(c.result.allocations.map(r=>r.allocatedKits),counts);scenarios++;
      const total=counts.reduce((a,b)=>a+b,0),minimum=Math.min(...counts.map((n,i)=>n/rows[i].demand));
      assert.equal(c.usefulAllocationDelta,total-expected(v).reduce((a,b)=>a+b,0));
      return {id:c.id,food:c.addedStockKits,cap:c.restoredCapacity?.kits??0,total,minimum};
    });
    const dominates=(a:typeof objectives[0],b:typeof objectives[0])=>a.food<=b.food&&a.cap<=b.cap&&a.total>=b.total&&a.minimum>=b.minimum&&(a.food<b.food||a.cap<b.cap||a.total>b.total||a.minimum>b.minimum);
    assert.deepEqual(result.frontierIds,objectives.filter(b=>!objectives.some(a=>dominates(a,b))).map(a=>a.id));
    const target=objectives.filter(c=>c.total>=stock+1);assert.deepEqual(result.smallestTestedTargetIds,target.filter(b=>!target.some(a=>a.food<=b.food&&a.cap<=b.cap&&(a.food<b.food||a.cap<b.cap))).map(a=>a.id));
    diversity.add(rows.length+':'+stock+':'+increment);
  }),parameters);
  console.log(JSON.stringify({frontierScenarios:scenarios,diverseDomains:diversity.size,seed}));assert.ok(diversity.size>100);
});
test('fresh accounting histories follow independent conservation equations, corrections and report unknowns',()=>{
  fc.assert(fc.property(fc.tuple(...Array.from({length:7},()=>fc.integer({min:0,max:31}))),parts=>{
    const [transport,transitLoss,transitReturn,center,collection,centerLoss,centerReturn]=parts;
    const received=center+collection+centerLoss+centerReturn,dispatch=received+transport+transitLoss+transitReturn;
    const events:LedgerEvent[]=[];const add=(eventType:LedgerEvent['eventType'],quantityKits:number)=>{if(quantityKits||['receipt','collection','in_transit'].includes(eventType))events.push({id:randomUUID(),eventType,quantityKits,reason:'SYNTHETIC generated event',source:'fresh '+seed,occurredAt:'2026-11-10T00:00:00Z',recordedAt:'2026-11-10T00:01:00Z'});};
    add('dispatch',dispatch);assert.equal(reconcile(events).receiptReportedKits,null);
    add('receipt',received);add('loss_transit',transitLoss);add('return',transitReturn);add('collection',collection);add('loss_center',centerLoss);add('return_center',centerReturn);add('in_transit',Math.floor(transport/2));
    const result=reconcile(events);assert.equal(result.valid,true);assert.equal(result.transportBalanceKits,transport);assert.equal(result.centerBalanceKits,center);assert.equal(result.knownLossKits,transitLoss+centerLoss);assert.equal(result.unexplainedTransportKits,transport-Math.floor(transport/2));
    add('collection',center+1);assert.equal(reconcile(events).valid,false);events.pop();
    const last=events.at(-1)!;events.push({...last,id:randomUUID(),reversesEventId:last.id});assert.equal(reconcile(events).reportedInTransitKits,null);
    assert.equal(reconcile(events).valid,true);
  }),parameters);
});
test('fresh exact receipts detect changed content, unavailable engines, and unsafe exports',async()=>{
  await fc.assert(fc.asyncProperty(fc.integer({min:1,max:71}),async n=>{
    const snapshot:AuthoritativeSnapshot={organizationId:randomUUID(),periodId:randomUUID(),revision:n,input:input([{demand:n+8,capacity:n+3}],n),provenance:'simulated',assumptions:['synthetic'],sources:{stock:{source:'fresh'},regions:[]}};
    const record=computeDecision(snapshot,{algorithm:'srs-progressive-maxmin',reason:' \t\u200b=HYPERLINK("evil") <script>alert(1)</script>'});assert.ok(record.ok);
    const hash=await fingerprint(record);assert.equal((await replayDecision(record,hash)).status,'exact');
    const changed=structuredClone(record);changed.snapshot.input.stockKits++;assert.equal((await replayDecision(changed,hash)).status,'tampered');
    changed.engineVersion='unavailable/0';assert.equal((await replayDecision(changed,await fingerprint(changed))).status,'engine_unavailable');
    assert.ok(csvCell(record.choice.reason).startsWith('"\''));assert.ok(!exportDecisionHtml(record,hash).includes('<script>'));
  }),{...parameters,numRuns:60});
});
test('bounded search is explicitly incomplete and stock cannot fix a closed center',()=>{
  const v=input([{demand:17,capacity:0}],5);v.regions[0].status='closed';
  const result=interventionFrontier(v,{stockIncrements:[1,2,3],capacityIncrements:[],includeCombined:false,maxCandidates:2});assert.ok(result.ok);assert.equal(result.complete,false);assert.equal(result.results[1].usefulAllocationDelta,0);
});
