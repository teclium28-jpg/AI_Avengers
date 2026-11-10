import { canonicalJson, fingerprint, computeDecision, replayDecision, reconcile, cleanRegionRows, cleanStockRows, prepareImport, optimizeAllocation, exportDecisionCsv, exportDecisionHtml } from '@fairshare/domain';
import type { LedgerEvent } from '@fairshare/domain';
import { ApiError, type AcceptRequest, type ImportRequest, type EventRequest, type ReviewRequest, type RequestContext, type WriteResult } from './contracts.ts';
import { Repository, type Transaction } from './repository.ts';

export class DecisionService {
  repository: Repository;
  // Dependency hooks coordinate deterministic integration-test barriers and faults.
  hooks: { afterCompute?: () => Promise<void>; beforeCommit?: () => Promise<void> };
  constructor(repository: Repository, hooks: DecisionService['hooks'] = {}) { this.repository=repository; this.hooks=hooks; }
  async rate(context:RequestContext) {
    await this.repository.transaction(context,async tx => { if(!(await tx`select fairshare.take_rate_limit() as allowed`)[0].allowed) return false; return true; }).then(allowed => {if(!allowed) throw new ApiError(429,'RATE_LIMIT','Request limit exceeded');});
  }
  async snapshot(c:RequestContext,period:string) { return this.repository.transaction(c, tx=>this.repository.snapshot(tx,period)); }
  async prior(c:RequestContext,key:string,period:string,hash:string):Promise<WriteResult|null> {
    return this.repository.transaction(c,async tx => {
      const [row]=await tx`select *,fairshare.actor_membership() as actor from fairshare.idempotency_records where request_key=${key}::uuid`;
      if(!row) return null;
      if(row.actor_id!==row.actor) throw new ApiError(403,'FORBIDDEN','Idempotency key belongs to another actor');
      if(row.payload_hash!==hash||row.period_id!==period) throw new ApiError(409,'KEY_CONFLICT','Idempotency key payload differs');
      return row.state==='completed'?{status:row.response_status,body:row.response_body}:null;
    });
  }
  async mutate(c:RequestContext,key:string,period:string,hash:string,roles:string[],center:string|null,run:(tx:Transaction)=>Promise<WriteResult>) {
    return this.repository.transaction(c,async tx => {
      await this.repository.authorize(tx,roles,center);
      const saved=(await tx`select fairshare.claim_request(${period}::uuid,${key}::uuid,${hash}) as saved`)[0].saved;
      if(saved) return saved as WriteResult;
      const result=await run(tx);
      await tx`select fairshare.finish_request(${key}::uuid,${result.status},${tx.json(result.body as never)})`;
      await this.hooks.beforeCommit?.();
      return result;
    });
  }
  async accept(c:RequestContext,key:string,request:AcceptRequest) {
    const hash=await fingerprint({operation:'accept',request});
    // Current authorization still applies when replaying a previously committed key.
    await this.repository.transaction(c,tx=>this.repository.authorize(tx,['coordinator']));
    const saved=await this.prior(c,key,request.periodId,hash); if(saved) return saved;
    const snapshot=await this.snapshot(c,request.periodId);
    if(snapshot.revision!==request.expectedRevision) throw new ApiError(409,'STALE_REVISION','Reload the current snapshot');
    const choice={algorithm:request.algorithm,reason:request.reason,...(request.overrides?{overrides:request.overrides}:{})};
    const record=computeDecision(snapshot,choice);
    if(!record.ok) throw new ApiError(422,'INVALID_DECISION','Decision failed independent validation',record);
    const payload={periodId:request.periodId,expectedRevision:request.expectedRevision,record,canonical:canonicalJson(record),hash:await fingerprint(record),snapshotCanonical:canonicalJson(snapshot),snapshotHash:await fingerprint(snapshot),planId:crypto.randomUUID(),receiptId:crypto.randomUUID(),provenance:snapshot.provenance,requestId:c.requestId};
    await this.hooks.afterCompute?.();
    return this.mutate(c,key,request.periodId,hash,['coordinator'],null,async tx=>({status:201,body:{...await this.repository.write(tx,'accept',payload),fingerprint:payload.hash}}));
  }
  async import(c:RequestContext,key:string,request:ImportRequest) {
    const region=cleanRegionRows(request.regions), stock=cleanStockRows([request.stock]);
    const prepared=prepareImport(request.stock.period_id,region.rows,stock.rows);
    const issues=[...region.issues,...stock.issues,...prepared.issues];
    if(issues.length||!prepared.input||request.regions.some(r=>r.period_id!==request.stock.period_id)) throw new ApiError(422,'INVALID_IMPORT','Import contains invalid rows',issues);
    const input=prepared.input, validation=optimizeAllocation(input);
    // An operational disruption may create a commitment conflict: persist the
    // observed input, then acceptance correctly fails until it is resolved.
    if(!validation.ok && validation.kind!=='input_conflict') throw new ApiError(422,'INVALID_IMPORT','Input is outside the planning contract',validation);
    const hash=await fingerprint({operation:'import',request});
    return this.mutate(c,key,request.periodId,hash,['coordinator'],null,async tx=>{
      const [period]=await tx`select code from fairshare.planning_periods where id=${request.periodId}::uuid`;
      if(!period||period.code!==input.periodId) throw new ApiError(422,'PERIOD_MISMATCH','CSV period must match the selected period');
      return {status:201,body:await this.repository.write(tx,'import',{...request,input,source:request.stock.source,observedAt:request.stock.as_of_date,requestId:c.requestId})};
    });
  }
  async event(c:RequestContext,movementId:string,request:EventRequest) {
    const reservation=await this.repository.transaction(c,async tx=>{
      const [row]=await tx`select period_id,center_id from fairshare.reservations where id=${request.reservationId}::uuid`;
      if(!row) throw new ApiError(404,'NOT_FOUND','Reservation not found'); return row;
    });
    const hash=await fingerprint({operation:'event',movementId,request});
    const roles=request.eventType==='dispatch'||request.reversesEventId?['coordinator']:['coordinator','operator'];
    return this.mutate(c,request.eventKey,reservation.period_id,hash,roles,reservation.center_id,async tx=>{
      await tx`select fairshare.lock_period(${reservation.period_id}::uuid)`;
      const payload={...request,movementId,periodId:reservation.period_id,requestId:c.requestId};
      await this.repository.write(tx,'movement',payload);
      const history=await this.repository.events(tx,movementId);
      if(history.length>=1000) throw new ApiError(422,'EVENT_LIMIT','Movement event limit reached');
      const proposed:LedgerEvent={id:crypto.randomUUID(),eventType:request.eventType,quantityKits:request.quantityKits,reversesEventId:request.reversesEventId??null,occurredAt:request.occurredAt,recordedAt:new Date().toISOString(),reason:request.reason,source:request.source};
      const balances=reconcile([...history,proposed]);
      if(!balances.valid) {
        const result=await this.repository.write(tx,'conflict',{...payload,report:request,findings:balances.findings});
        return {status:422,body:{error:{code:'CONFLICTING_REPORT',message:'Report preserved for review; ledger unchanged',requestId:c.requestId,details:balances.findings},...result}};
      }
      const result=await this.repository.write(tx,'event',{...payload,id:proposed.id});
      if(balances.unexplainedTransportKits>0||balances.knownLossKits>0) Object.assign(result,await this.repository.write(tx,'open_review',{...payload,reason:'Transport balance or reported loss needs explanation'}));
      return {status:201,body:{...result,eventId:proposed.id,movementId,balances:reconcile(await this.repository.events(tx,movementId))}};
    });
  }
  async review(c:RequestContext,key:string,id:string,request:ReviewRequest) {
    return this.mutate(c,key,request.periodId,await fingerprint({operation:'review',id,request}),['coordinator','reviewer'],null,async tx=>({status:200,body:await this.repository.write(tx,'review',{...request,reviewId:id,requestId:c.requestId})}));
  }
  async movement(c:RequestContext,id:string) {
    return this.repository.transaction(c,async tx=>{
      const [movement]=await tx`select * from fairshare.movements where id=${id}::uuid`;
      if(!movement) throw new ApiError(404,'NOT_FOUND','Movement not found');
      return {movement,balances:reconcile(await this.repository.events(tx,id)),reviews:await tx`select * from fairshare.reviews where movement_id=${id}::uuid order by id limit 100`,conflictingReports:await tx`select * from fairshare.conflicting_reports where movement_id=${id}::uuid order by recorded_at limit 100`,reviewHistory:await tx`select * from fairshare.audit_events where action='review' and details->>'reviewId' in (select id::text from fairshare.reviews where movement_id=${id}::uuid) order by occurred_at,id limit 100`};
    });
  }
  async summary(c:RequestContext,period:string,cursor:string|undefined,limit:number) {
    return this.repository.transaction(c,async tx=>{
      await this.repository.authorize(tx,['coordinator','reviewer']);
      if(!(await tx`select id from fairshare.planning_periods where id=${period}::uuid`).length) throw new ApiError(404,'NOT_FOUND','Period not found');
      const rows=await tx`select * from fairshare.reservations where period_id=${period}::uuid and (${cursor??null}::uuid is null or id>${cursor??null}::uuid) order by id limit ${limit+1}`;
      return {reservations:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1].id:null};
    });
  }
  async replay(c:RequestContext,id:string) {
    const saved=await this.repository.transaction(c,tx=>this.repository.receipt(tx,id));
    const recorded=await replayDecision(saved.record,saved.hash);
    if(recorded.status!=='exact') return recorded;
    try { return await replayDecision(saved.record,saved.hash,await this.snapshot(c,saved.periodId)); }
    catch(error) {
      if(error instanceof ApiError && error.code==='INCOMPLETE_INPUT') return {...recorded,currentUnavailable:{code:error.code,message:error.message}};
      throw error;
    }
  }
  async export(c:RequestContext,id:string,format:'csv'|'html') {
    const saved=await this.repository.transaction(c,tx=>this.repository.receipt(tx,id));
    if(await fingerprint(saved.record)!==saved.hash) throw new ApiError(409,'TAMPERED','Receipt fingerprint mismatch');
    return format==='csv'?exportDecisionCsv(saved.record,saved.hash):exportDecisionHtml(saved.record,saved.hash);
  }
}
