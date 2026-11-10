import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import { generateKeyPair, createLocalJWKSet, exportJWK, SignJWT } from 'jose';
import { startDatabase } from './postgres.mjs';
import { Repository } from '../../apps/api/src/repository.ts';
import { DecisionService } from '../../apps/api/src/service.ts';
import { createApp } from '../../apps/api/src/index.ts';
import type { RequestContext, ImportRequest } from '../../apps/api/src/contracts.ts';

const seed=Number(process.env.FAIRSHARE_SEED??randomInt(1,2147483647));
let state=seed; const int=(a:number,b:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a+state%(b-a+1);};
function barrier(n:number) {let release!:()=>void; const ready=new Promise<void>(r=>release=r);return async()=>{if(--n===0)release();await ready;};}

test('fresh native PostgreSQL backend campaign',async t=>{
  console.log(JSON.stringify({generator:'backend-native/1',seed,postgres:'17.11',synthetic:true}));
  const db=await startDatabase(), sql=db.connect(), sql2=db.connect();
  const repo=new Repository(sql), service=new DecisionService(repo), service2=new DecisionService(new Repository(sql2));
  const {privateKey,publicKey}=await generateKeyPair('ES256'); const issuer='https://synthetic.invalid/auth/v1';
  const jwk=await exportJWK(publicKey); const app=createApp({service,issuer,getKey:createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'ES256'}]})});
  const token=async(actor:string,claims:Record<string,unknown>={})=>new SignJWT(claims).setProtectedHeader({alg:'ES256',kid:'test'}).setSubject(actor).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('10m').sign(privateKey);
  const latency:number[]=[];
  async function fixture() {
    const organizationId=randomUUID(),actorId=randomUUID(),periodId=randomUUID(),member=randomUUID(),code='fresh-'+randomUUID();
    await db.admin`insert into auth.users values(${actorId})`;
    await db.admin`insert into fairshare.organizations(id,name,provenance) values(${organizationId},'SYNTHETIC generated campaign','simulated')`;
    await db.admin`insert into fairshare.memberships(organization_id,id,user_id,display_name,role,provenance) values(${organizationId},${member},${actorId},'SYNTHETIC test identity','coordinator','reported')`;
    await db.admin`insert into fairshare.planning_periods(organization_id,id,code,starts_at,ends_at,provenance) values(${organizationId},${periodId},${code},now(),now()+interval '1 day','simulated')`;
    const c:RequestContext={organizationId,actorId,requestId:randomUUID()};
    const demand=int(37,83),stock=int(19,35);
    const request:ImportRequest={periodId,expectedRevision:0,provenance:'simulated',stock:{period_id:code,stock_kits:String(stock),stock_type:'confirmed',source:'SYNTHETIC fresh generator '+seed,as_of_date:new Date().toISOString()},regions:[{period_id:code,region_id:'region-'+randomUUID(),region_name:'SYNTHETIC generated region',center_id:'center-'+randomUUID(),demand_kits:String(demand),capacity_kits:String(demand),prior_dispatched_kits:'0',status:'open',reported_or_simulated:'simulated'}]};
    const bearer=await token(actorId);
    async function call(path:string,body?:unknown,method=body?'POST':'GET',headers:Record<string,string>={}) {
      const start=performance.now();
      const response=await app.request('/api/v1'+path,{method,headers:{Authorization:'Bearer '+bearer,'X-Organization-Id':organizationId,'Idempotency-Key':randomUUID(),'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
      latency.push(performance.now()-start); return response;
    }
    const imported=await service.import(c,randomUUID(),request); assert.equal(imported.status,201);
    const snapshot=await service.snapshot(c,periodId);
    return {c,periodId,member,request,call,stock,choice:{periodId,expectedRevision:snapshot.revision,algorithm:'srs-progressive-maxmin' as const,reason:'SYNTHETIC campaign verified acceptance'}};
  }
  try {
    await t.test('import snapshot acceptance partial movement review replay and safe exports',async()=>{
      const f=await fixture();
      const accepted=await f.call('/plans/accept',f.choice); assert.equal(accepted.status,201,await accepted.clone().text()); const saved=await accepted.json();
      const summary=await f.call(`/periods/${f.periodId}/summary`); assert.equal(summary.status,200);const [r]=(await summary.json()).reservations;
      assert.equal(Number(r.reserved_kits),f.stock);
      const movement=randomUUID(),received=int(7,14),collected=int(1,6);
      const event=(type:string,quantity:number)=>({reservationId:r.id,eventKey:randomUUID(),eventType:type,quantityKits:quantity,reason:'SYNTHETIC generated report',source:'campaign '+seed,reference:randomUUID(),provenance:'simulated',occurredAt:new Date().toISOString()});
      let review:string; const dispatch=event('dispatch',f.stock);
      const first=await f.call(`/movements/${movement}/events`,dispatch);assert.equal(first.status,201,await first.clone().text());const firstBody=await first.json(); review=firstBody.reviewId;
      assert.equal(firstBody.balances.receiptReportedKits,null);
      const duplicate=await f.call(`/movements/${movement}/events`,dispatch);assert.deepEqual(await duplicate.json(),firstBody);
      for(const [type,n] of [['receipt',received],['collection',collected]] as const){const res=await f.call(`/movements/${movement}/events`,event(type,n));assert.equal(res.status,201,await res.clone().text());}
      const ledger=await service.movement(f.c,movement);assert.equal(ledger.balances.transportBalanceKits,f.stock-received);assert.equal(ledger.balances.centerBalanceKits,received-collected);
      const invalid=await f.call(`/movements/${movement}/events`,event('collection',f.stock+1));assert.equal(invalid.status,422); assert.equal((await service.movement(f.c,movement)).balances.centerBalanceKits,received-collected);
      const reviewed=await f.call('/reviews/'+review,{periodId:f.periodId,status:'resolved',reason:'SYNTHETIC carrier confirmed remaining kits in transit',provenance:'simulated'},'PATCH');assert.equal(reviewed.status,200,await reviewed.clone().text());
      const replay=await f.call('/receipts/'+saved.receiptId+'/replay');assert.equal(replay.status,200);assert.equal((await replay.json()).status,'exact');
      for(const format of ['csv','html']) assert.equal((await f.call('/receipts/'+saved.receiptId+'/export?format='+format)).status,200);
      const updated=await service.snapshot(f.c,f.periodId);assert.equal(updated.input.regions[0].priorDispatchedKits,f.stock);
    });
    await t.test('different-key race on same revision has one winner',async()=>{
      const f=await fixture(),gate=barrier(2);service.hooks.afterCompute=gate;service2.hooks.afterCompute=gate;
      try { const results=await Promise.allSettled([service.accept(f.c,randomUUID(),f.choice),service2.accept(f.c,randomUUID(),f.choice)]);
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
        assert.equal((await db.admin`select count(*)::int n from fairshare.plans where period_id=${f.periodId}`)[0].n,1);
      } finally {service.hooks={};service2.hooks={};}
    });
    await t.test('same-key race, lost response replay, changed payload and stale rejection',async()=>{
      const f=await fixture(),gate=barrier(2),key=randomUUID();service.hooks.afterCompute=gate;service2.hooks.afterCompute=gate;
      let results;
      try {results=await Promise.all([service.accept(f.c,key,f.choice),service2.accept(f.c,key,f.choice)]);}finally{service.hooks={};service2.hooks={};}
      assert.deepEqual(results[0],results[1]);assert.deepEqual(await service.accept(f.c,key,f.choice),results[0]);
      await assert.rejects(service.accept(f.c,key,{...f.choice,reason:'Different content'}));
      await assert.rejects(service.accept(f.c,randomUUID(),f.choice));
      assert.equal((await db.admin`select count(*)::int n from fairshare.reservations where period_id=${f.periodId}`)[0].n,1);
    });
    await t.test('failure after all writes rolls back plan reservations receipt audit and idempotency',async()=>{
      const f=await fixture(),key=randomUUID();service.hooks.beforeCommit=async()=>{throw new Error('deliberate pre-commit fault');};
      try{await assert.rejects(service.accept(f.c,key,f.choice));}finally{service.hooks={};}
      for(const table of ['plans','allocations','reservations','decision_receipts']) assert.equal((await db.admin.unsafe(`select count(*)::int n from fairshare.${table} where period_id=$1`,[f.periodId]))[0].n,0);
      assert.equal((await db.admin`select count(*)::int n from fairshare.idempotency_records where request_key=${key}`)[0].n,0);
      assert.equal((await service.snapshot(f.c,f.periodId)).revision,f.choice.expectedRevision);
    });
    await t.test('cross-organization API and direct SQL, missing context, revoked membership and bad JWT',async()=>{
      const a=await fixture(),b=await fixture(),accepted=await service.accept(a.c,randomUUID(),a.choice),receipt=accepted.body.receiptId;
      for(const path of [`/periods/${a.periodId}/snapshot`,`/periods/${a.periodId}/summary`,`/receipts/${receipt}/replay`,`/receipts/${receipt}/export?format=csv`]) assert.equal((await b.call(path)).status,404,path);
      assert.equal((await b.call('/plans/accept',a.choice)).status,404);
      await repo.transaction(b.c,async tx=>{assert.equal((await tx`select * from fairshare.plans where period_id=${a.periodId}::uuid`).length,0);});
      await assert.rejects(repo.transaction(b.c,tx=>tx`select fairshare.lock_period(${a.periodId}::uuid)`),(e:any)=>e.code==='P0002');
      await assert.rejects(repo.transaction(b.c,tx=>tx`update fairshare.planning_periods set revision=99 where id=${a.periodId}::uuid`),(e:any)=>e.code==='42501');
      assert.equal((await sql`select * from fairshare.plans`).length,0);
      assert.equal((await a.call(`/periods/${a.periodId}/snapshot`,undefined,'GET',{'X-Organization-Id':''})).status,403);
      assert.equal((await a.call(`/periods/${a.periodId}/snapshot`,undefined,'GET',{Authorization:'Bearer corrupted'})).status,401);
      await db.admin`update fairshare.memberships set active=false where organization_id=${a.c.organizationId}`;
      assert.equal((await a.call(`/periods/${a.periodId}/snapshot`)).status,403);
    });
    await t.test('bounded payloads and pagination',async()=>{
      const f=await fixture();assert.equal((await f.call('/imports',{huge:'a'.repeat(262145)})).status,413);
      assert.equal((await f.call(`/periods/${f.periodId}/summary?limit=101`)).status,422);
    });
    await t.test('capacity change invalidates concurrent acceptance and old dispatch reservation',async()=>{
      const f=await fixture();let resume!:()=>void,computed!:()=>void;
      const reached=new Promise<void>(r=>computed=r),hold=new Promise<void>(r=>resume=r);
      service.hooks.afterCompute=async()=>{computed();await hold;};
      const accepting=service.accept(f.c,randomUUID(),f.choice);await reached;
      const changed=structuredClone(f.request);changed.expectedRevision=f.choice.expectedRevision;changed.regions[0].capacity_kits=String(int(8,17));
      await service2.import(f.c,randomUUID(),changed);resume();await assert.rejects(accepting);service.hooks={};
      const snap=await service.snapshot(f.c,f.periodId);await service.accept(f.c,randomUUID(),{...f.choice,expectedRevision:snap.revision});
      const [res]=(await service.summary(f.c,f.periodId,undefined,25)).reservations;
      changed.expectedRevision=(await service.snapshot(f.c,f.periodId)).revision;changed.regions[0].capacity_kits='0';changed.regions[0].status='closed';
      await service.import(f.c,randomUUID(),changed);
      await assert.rejects(service2.event(f.c,randomUUID(),{reservationId:res.id,eventKey:randomUUID(),eventType:'dispatch',quantityKits:1,reason:'synthetic stale dispatch',source:'synthetic',reference:'synthetic',provenance:'simulated',occurredAt:new Date().toISOString()}));
      assert.equal((await service.snapshot(f.c,f.periodId)).input.regions[0].priorDispatchedKits,0);
    });
    await t.test('operator center scope, confirmed zero, delayed reports and exact correction',async()=>{
      const f=await fixture();await service.accept(f.c,randomUUID(),f.choice);const [r]=(await service.summary(f.c,f.periodId,undefined,25)).reservations;
      const user=randomUUID(),membership=randomUUID();await db.admin`insert into auth.users values(${user})`;
      await db.admin`insert into fairshare.memberships(organization_id,id,user_id,display_name,role,provenance) values(${f.c.organizationId},${membership},${user},'SYNTHETIC operator','operator','reported')`;
      const operator={...f.c,actorId:user},movement=randomUUID();
      const event=(eventType:any,quantityKits:number)=>({reservationId:r.id,eventKey:randomUUID(),eventType,quantityKits,reason:'SYNTHETIC fresh history',source:'synthetic',reference:randomUUID(),provenance:'simulated' as const,occurredAt:new Date(Date.now()-int(1000,90000)).toISOString()});
      await service.event(f.c,movement,event('dispatch',f.stock));
      await assert.rejects(service.event(operator,movement,event('receipt',0)));
      await repo.transaction(operator,async tx=>{assert.equal((await tx`select * from fairshare.movement_events where movement_id=${movement}::uuid`).length,0);assert.equal((await tx`select * from fairshare.reviews where movement_id=${movement}::uuid`).length,0);});
      await db.admin`insert into fairshare.center_operators values(${f.c.organizationId},${r.center_id},${membership})`;
      await service.event(operator,movement,event('receipt',0));assert.equal((await service.movement(operator,movement)).balances.receiptReportedKits,0);
      const quantity=int(5,11),received=await service.event(operator,movement,event('receipt',quantity));
      await assert.rejects(service.event(operator,movement,{...event('receipt',quantity),reversesEventId:received.body.eventId as string}));
      await service.event(f.c,movement,{...event('receipt',quantity),reversesEventId:received.body.eventId as string});
      assert.equal((await service.movement(operator,movement)).balances.centerBalanceKits,0);
      const conflict=await service.event(operator,movement,event('collection',1));assert.equal(conflict.status,422);
      const transit=int(1,f.stock-1);await service.event(operator,movement,event('in_transit',transit));
      assert.equal((await service.movement(operator,movement)).balances.unexplainedTransportKits,f.stock-transit);
      const operatorToken=await token(user);assert.equal((await f.call('/plans/accept',f.choice,'POST',{Authorization:'Bearer '+operatorToken})).status,403);
    });
  }finally{await sql.end();await sql2.end();await db.stop();}
  latency.sort((a,b)=>a-b);console.log(JSON.stringify({workload:'native PG + in-process Hono, generated API calls',samples:latency.length,p50Ms:latency[Math.floor(latency.length*.5)],p95Ms:latency[Math.floor(latency.length*.95)],seed}));
});
