import { randomUUID,randomInt } from 'node:crypto';
import { startDatabase } from '../tests/backend/postgres.mjs';
import { Repository } from '../apps/api/src/repository.ts';
import { DecisionService } from '../apps/api/src/service.ts';
import { interventionFrontier } from '../packages/domain/src/index.ts';
const db=await startDatabase(),sql=db.connect(),service=new DecisionService(new Repository(sql));
try {
 const c={organizationId:randomUUID(),actorId:randomUUID(),requestId:randomUUID()},periodId=randomUUID(),code='demo-'+randomUUID(),stock=randomInt(39,59);
 await db.admin`insert into auth.users values(${c.actorId})`;
 await db.admin`insert into fairshare.organizations(id,name,provenance) values(${c.organizationId},'SYNTHETIC backend demo','simulated')`;
 await db.admin`insert into fairshare.memberships(organization_id,user_id,display_name,role,provenance) values(${c.organizationId},${c.actorId},'SYNTHETIC demo identity','coordinator','reported')`;
 await db.admin`insert into fairshare.planning_periods(organization_id,id,code,starts_at,ends_at,provenance) values(${c.organizationId},${periodId},${code},now(),now()+interval '1 day','simulated')`;
 const region='region-'+randomUUID(),center='center-'+randomUUID(),capacity=randomInt(11,18);
 const request={periodId,expectedRevision:0,provenance:'simulated' as const,stock:{period_id:code,stock_kits:String(stock),stock_type:'confirmed' as const,source:'SYNTHETIC demo generator',as_of_date:new Date().toISOString()},regions:[{period_id:code,region_id:region,region_name:'SYNTHETIC center disruption',center_id:center,demand_kits:String(stock+17),capacity_kits:String(stock+17),prior_dispatched_kits:'0',status:'open',reported_or_simulated:'simulated'}]};
 await service.import(c,randomUUID(),request);
 request.expectedRevision=(await service.snapshot(c,periodId)).revision;request.regions[0].capacity_kits=String(capacity);
 await service.import(c,randomUUID(),request);
 const snapshot=await service.snapshot(c,periodId),frontier=interventionFrontier(snapshot.input,{stockIncrements:[7],capacityIncrements:[{centerId:center,kits:9}],includeCombined:true});
 console.log(JSON.stringify({synthetic:true,step:'capacity disruption and hypothetical interventions',stock,capacity,frontier},null,2));
 const accepted=await service.accept(c,randomUUID(),{periodId,expectedRevision:snapshot.revision,algorithm:'srs-progressive-maxmin',reason:'SYNTHETIC demo accepts current verified capacity'});
 const [reservation]=(await service.summary(c,periodId,undefined,25)).reservations,movement=randomUUID();
 for(const [eventType,quantityKits] of [['dispatch',capacity],['receipt',capacity-4],['collection',capacity-7]] as const) await service.event(c,movement,{reservationId:reservation.id,eventKey:randomUUID(),eventType,quantityKits,reason:'SYNTHETIC partial delivery report',source:'demo',reference:randomUUID(),provenance:'simulated',occurredAt:new Date().toISOString()});
 console.log(JSON.stringify({step:'verified acceptance and discrepancy',accepted,evidence:await service.movement(c,movement)},null,2));
 const replay=await service.replay(c,accepted.body.receiptId as string);
 console.log(JSON.stringify({step:'receipt replay',status:replay.status,receiptId:accepted.body.receiptId,fingerprint:accepted.body.fingerprint}));
 console.log(await service.export(c,accepted.body.receiptId as string,'csv'));
}finally{await sql.end();await db.stop();}
