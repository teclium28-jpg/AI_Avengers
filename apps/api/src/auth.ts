import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { ApiError, uuid } from './contracts.ts';
const keys = new Map<string, JWTVerifyGetKey>();
export async function verifyToken(token:string,issuer:string,getKey?:JWTVerifyGetKey) {
  if(!getKey) {
    if(!keys.has(issuer)) {
      if(keys.size>=4) keys.delete(keys.keys().next().value!);
      keys.set(issuer,createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'),{cacheMaxAge:600000,timeoutDuration:3000}));
    }
    getKey=keys.get(issuer)!;
  }
  try {
    const {payload}=await jwtVerify(token,getKey,{issuer,audience:'authenticated',algorithms:['ES256','RS256'],requiredClaims:['sub','exp','iat']});
    return uuid.parse(payload.sub);
  } catch(error) {
    if(error instanceof TypeError || ['ERR_JWKS_TIMEOUT','ERR_JOSE_GENERIC'].includes((error as {code?:string}).code??'')) throw new ApiError(503,'AUTH_UNAVAILABLE','Identity provider unavailable');
    throw new ApiError(401,'UNAUTHORIZED','Valid access token required');
  }
}
