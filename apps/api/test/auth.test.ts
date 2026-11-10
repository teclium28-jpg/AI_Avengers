import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair,createLocalJWKSet,exportJWK,SignJWT,errors } from 'jose';
import { verifyToken } from '../src/auth.ts';
test('JWT signature, issuer, audience, expiry, required subject and provider failure',async()=>{
 const pair=await generateKeyPair('ES256'),other=await generateKeyPair('ES256'),issuer='https://synthetic.invalid/auth/v1';
 const jwk=await exportJWK(pair.publicKey),key=createLocalJWKSet({keys:[{...jwk,alg:'ES256'}]});
 const actor=crypto.randomUUID();
 const sign=(claims:Record<string,unknown>,privateKey=pair.privateKey)=>new SignJWT({sub:actor,iss:issuer,aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,...claims}).setProtectedHeader({alg:'ES256'}).sign(privateKey);
 assert.equal(await verifyToken(await sign({}),issuer,key),actor);
 for(const claims of [{iss:'other'},{aud:'other'},{exp:1},{sub:'invalid'},{exp:undefined}]) await assert.rejects(verifyToken(await sign(claims),issuer,key),(e:any)=>e.status===401);
 await assert.rejects(verifyToken(await sign({},other.privateKey),issuer,key),(e:any)=>e.status===401);
 await assert.rejects(verifyToken(await sign({}),issuer,async()=>{throw new errors.JWKSTimeout();}),(e:any)=>e.status===503);
});
