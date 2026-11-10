import { Hono } from "hono";
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import postgres from 'postgres';
import type { JWTVerifyGetKey } from 'jose';
import { verifyToken } from './auth.ts';
import { Repository } from './repository.ts';
import { DecisionService } from './service.ts';
import { ApiError, uuid, acceptRequest, importRequest, eventRequest, reviewRequest, pageRequest, type RequestContext } from './contracts.ts';

interface Bindings { DATABASE_URL?:string; SUPABASE_URL?:string }
interface Options { service?:DecisionService; issuer?:string; getKey?:JWTVerifyGetKey }
type AppEnvironment={Bindings:Bindings;Variables:{context:RequestContext;service:DecisionService}};

export function createApp(options:Options={}) {
  const app = new Hono<AppEnvironment>();
  app.get("/api/v1/health", (c) => { c.header('Cache-Control','no-store'); c.header('X-Content-Type-Options','nosniff'); return c.json({ status: "ok", stage: "scaffold" }); });
  app.use('/api/v1/*',async(c,next)=>{
    c.set('context',{requestId:crypto.randomUUID(),organizationId:'',actorId:''});
    c.header('Cache-Control','no-store'); c.header('X-Content-Type-Options','nosniff');
    await next();
  });
  app.use('/api/v1/*',bodyLimit({maxSize:262144,onError:()=>{throw new ApiError(413,'PAYLOAD_TOO_LARGE','Request exceeds 256 KiB');}}));
  app.use('/api/v1/*',async(c,next)=>{
    const issuer=options.issuer??(c.env?.SUPABASE_URL?c.env.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1':undefined);
    if(!issuer) throw new ApiError(503,'NOT_CONFIGURED','Authentication is not configured');
    const bearer=c.req.header('Authorization');
    if(!bearer?.startsWith('Bearer ')||bearer.length>16384) throw new ApiError(401,'UNAUTHORIZED','Access token required');
    const actorId=await verifyToken(bearer.slice(7),issuer,options.getKey);
    const organizationId=uuid.safeParse(c.req.header('X-Organization-Id'));
    if(!organizationId.success) throw new ApiError(403,'ORGANIZATION_REQUIRED','Valid organization context required');
    c.set('context',{...c.get('context'),actorId,organizationId:organizationId.data});
    let sql:postgres.Sql|undefined;
    if(options.service) c.set('service',options.service);
    else {
      if(!c.env?.DATABASE_URL) throw new ApiError(503,'NOT_CONFIGURED','Database is not configured');
      sql=postgres(c.env.DATABASE_URL,{max:1,prepare:false,ssl:'verify-full',connect_timeout:5,idle_timeout:5,fetch_types:false,onnotice:()=>{}});
      c.set('service',new DecisionService(new Repository(sql)));
    }
    try { await c.get('service').rate(c.get('context')); await next(); }
    finally { if(sql) await sql.end({timeout:1}); }
  });
  const key=(value:string|undefined)=>uuid.parse(value);
  app.get('/api/v1/periods/:id/snapshot',async c=>c.json(await c.get('service').snapshot(c.get('context'),uuid.parse(c.req.param('id')))));
  app.post('/api/v1/imports',async c=>{const r=await c.get('service').import(c.get('context'),key(c.req.header('Idempotency-Key')),importRequest.parse(await c.req.json()));return c.json(r.body,r.status as 201);});
  app.post('/api/v1/plans/accept',async c=>{const r=await c.get('service').accept(c.get('context'),key(c.req.header('Idempotency-Key')),acceptRequest.parse(await c.req.json()));return c.json(r.body,r.status as 201);});
  app.post('/api/v1/movements/:id/events',async c=>{const r=await c.get('service').event(c.get('context'),uuid.parse(c.req.param('id')),eventRequest.parse(await c.req.json()));return c.json(r.body,r.status as 201);});
  app.get('/api/v1/movements/:id',async c=>c.json(await c.get('service').movement(c.get('context'),uuid.parse(c.req.param('id')))));
  app.patch('/api/v1/reviews/:id',async c=>{const r=await c.get('service').review(c.get('context'),key(c.req.header('Idempotency-Key')),uuid.parse(c.req.param('id')),reviewRequest.parse(await c.req.json()));return c.json(r.body,r.status as 200);});
  app.get('/api/v1/periods/:id/summary',async c=>{const page=pageRequest.parse(c.req.query());return c.json(await c.get('service').summary(c.get('context'),uuid.parse(c.req.param('id')),page.cursor,page.limit));});
  app.get('/api/v1/receipts/:id/replay',async c=>c.json(await c.get('service').replay(c.get('context'),uuid.parse(c.req.param('id')))));
  app.get('/api/v1/receipts/:id/export',async c=>{
    const format=c.req.query('format'); if(format!=='csv'&&format!=='html') throw new ApiError(422,'INVALID_FORMAT','Choose csv or html');
    const content=await c.get('service').export(c.get('context'),uuid.parse(c.req.param('id')),format);
    c.header('Content-Type',format==='csv'?'text/csv; charset=utf-8':'text/html; charset=utf-8');
    c.header('Content-Disposition',`attachment; filename="fairshare-receipt.${format}"`);
    c.header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox");
    return c.body(content);
  });
  app.notFound(c=>c.json({error:{code:'NOT_FOUND',message:'Endpoint not found',requestId:c.get('context')?.requestId}},404));
  app.onError((error,c)=>{
    let mapped=error instanceof ApiError?error:undefined;
    const code=(error as {code?:string}).code;
    if(error instanceof ZodError||error instanceof SyntaxError) mapped=new ApiError(422,'INVALID_REQUEST','Request does not match the contract');
    if(code==='42501') mapped=new ApiError(403,'FORBIDDEN','Permission denied');
    if(code==='P0002') mapped=new ApiError(404,'NOT_FOUND','Record not found or period closed');
    if(['40001','23505','22023'].includes(code??'')) mapped=new ApiError(409,'CONFLICT','Stale revision or conflicting request');
    if(['23514','23503','22P02','22003'].includes(code??'')) mapped=new ApiError(422,'INVALID_RECORD','Record violates database constraints');
    mapped??=new ApiError(503,'DEPENDENCY_UNAVAILABLE','Operation could not be completed');
    if(mapped.status===429) c.header('Retry-After','60');
    // Deliberately never log driver errors, tokens, source rows or credentials.
    return c.json({error:{code:mapped.code,message:mapped.message,requestId:c.get('context')?.requestId,...(mapped.details?{details:mapped.details}:{})}},mapped.status as 503);
  });
  return app;
}

export default createApp();
