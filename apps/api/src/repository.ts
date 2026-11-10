import postgres from 'postgres';
import { ApiError, type RequestContext } from './contracts.ts';
import type { AuthoritativeSnapshot, DecisionRecord, LedgerEvent } from '@fairshare/domain';
export type Transaction = postgres.TransactionSql;
export class Repository {
  sql: postgres.Sql;
  constructor(sql: postgres.Sql) { this.sql = sql; }
  async transaction<T>(context: RequestContext, run: (tx: Transaction) => Promise<T>): Promise<T> {
    return await this.sql.begin('isolation level read committed', async tx => {
      await tx`select set_config('app.org_id',${context.organizationId},true),set_config('app.actor_id',${context.actorId},true),set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;
      const [role] = await tx`select current_user='fairshare_runtime' and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb
        and not exists(select from pg_auth_members where member=r.oid)
        and not exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relowner=r.oid and n.nspname='fairshare') as safe
        from pg_roles r where rolname=current_user`;
      if (!role?.safe) throw new ApiError(503,'DATABASE_ROLE','Restricted database role required');
      if (!(await tx`select fairshare.actor_role() as role`)[0]?.role) throw new ApiError(403,'FORBIDDEN','Active organization membership required');
      return run(tx);
    }) as T;
  }
  async authorize(tx: Transaction, roles: string[], center: string | null = null) { await tx`select fairshare.authorize(${roles}::text[],${center}::uuid)`; }
  async snapshot(tx: Transaction, period: string): Promise<AuthoritativeSnapshot> {
    await this.authorize(tx, ['coordinator','reviewer']);
    // One statement gives inputs, commitments and revision the same MVCC snapshot.
    const [row] = await tx`select p.id,p.code,p.revision,p.provenance,
      (select row_to_json(s) from (select id,quantity_kits::int as kits,revision,source,observed_at,recorded_at,recorded_by,provenance from fairshare.stock_records where period_id=p.id and stock_type='confirmed' order by revision desc limit 1) s) as stock,
      (select jsonb_agg(x order by x.code) from (
        select rg.code,rg.name,c.code as center,d.quantity_kits::int as demand,cap.quantity_kits::int as capacity,cap.is_closed,
          to_jsonb(d) as demand_source,to_jsonb(cap) as capacity_source,
          (select coalesce(sum(case when e.reverses_event_id is null then e.quantity_kits else -e.quantity_kits end),0)::int from fairshare.movements m join fairshare.movement_events e on e.organization_id=m.organization_id and e.movement_id=m.id where m.period_id=p.id and m.region_id=rg.id and e.event_type='dispatch') as prior
        from fairshare.period_regions pr join fairshare.regions rg on rg.id=pr.region_id and rg.organization_id=pr.organization_id
        join fairshare.centers c on c.id=pr.center_id and c.organization_id=pr.organization_id
        left join lateral(select id,quantity_kits,revision,source,observed_at,recorded_at,recorded_by,provenance from fairshare.demand_records where period_id=p.id and region_id=rg.id order by revision desc limit 1) d on true
        left join lateral(select id,quantity_kits,revision,is_closed,source,observed_at,recorded_at,recorded_by,provenance from fairshare.capacity_records where period_id=p.id and center_id=c.id order by revision desc limit 1) cap on true
        where pr.period_id=p.id limit 101
      ) x) as regions from fairshare.planning_periods p where p.id=${period}::uuid`;
    if (!row) throw new ApiError(404,'NOT_FOUND','Period not found');
    const regions = row.regions as Array<{ code:string; name:string; center:string; demand:number|null; capacity:number|null; is_closed:boolean; prior:number; demand_source:{provenance:'reported'|'simulated'}; capacity_source:{provenance:'reported'|'simulated'} }> | null;
    if (!row.stock || !regions?.length || regions.length>100 || regions.some(r => r.demand===null || r.capacity===null)) throw new ApiError(422,'INCOMPLETE_INPUT','Complete bounded period inputs are required');
    return { organizationId: (await tx`select fairshare.current_organization_id() as id`)[0].id, periodId:row.id, revision:row.revision,
      provenance: row.provenance==='simulated' || row.stock.provenance==='simulated' || regions.some(r => r.demand_source.provenance==='simulated' || r.capacity_source.provenance==='simulated') ? 'simulated' : 'reported',
      assumptions:['Stock and capacity include prior dispatches.','Returns do not create confirmed reusable stock.','One region per center in this engine version.'],
      sources:{stock:row.stock,regions}, input:{periodId:row.code,stockKits:row.stock.kits,regions:regions.map(r => ({periodId:row.code,regionId:r.code,regionName:r.name,centerId:r.center,demandKits:r.demand!,capacityKits:r.capacity!,priorDispatchedKits:r.prior,status:r.is_closed?'closed':'open',provenance:r.demand_source.provenance==='simulated'||r.capacity_source.provenance==='simulated'?'simulated':'reported'}))} };
  }
  async write(tx: Transaction, operation: string, payload: Record<string,unknown>) {
    return (await tx`select fairshare.write_record(${operation},${tx.json(payload as postgres.JSONValue)}) as result`)[0].result as Record<string,unknown>;
  }
  async events(tx: Transaction, movement: string): Promise<LedgerEvent[]> {
    const rows = await tx`select id,event_type as "eventType",quantity_kits::int as "quantityKits",reverses_event_id as "reversesEventId",occurred_at::text as "occurredAt",recorded_at::text as "recordedAt",reason,source from fairshare.movement_events where movement_id=${movement}::uuid order by append_order limit 1001`;
    if(rows.length>1000) throw new ApiError(422,'EVENT_LIMIT','Movement exceeds the 1000-event replay limit');
    return rows as unknown as LedgerEvent[];
  }
  async receipt(tx: Transaction, id: string) {
    await this.authorize(tx,['coordinator','reviewer']);
    const [row] = await tx`select period_id,payload,fingerprint from fairshare.decision_receipts where id=${id}::uuid`;
    if (!row) throw new ApiError(404,'NOT_FOUND','Receipt not found');
    return {periodId:row.period_id as string,record:row.payload as DecisionRecord,hash:row.fingerprint as string};
  }
}
