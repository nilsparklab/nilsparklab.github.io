import { env } from '../config/env.js';
const buckets=new Map();
const WINDOW=60_000, LIMIT=60, MAX_BUCKETS=10_000;
function keyFor(req){
  const forwarded = env.TRUST_PROXY ? req.headers['x-forwarded-for'] : null;
  return (forwarded || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
}
export function allowRequest(req){
  const key=keyFor(req), now=Date.now(); let b=buckets.get(key);
  if(!b || now-b.start>=WINDOW){ b={start:now,count:0}; buckets.set(key,b); }
  b.count++;
  if(buckets.size>MAX_BUCKETS) buckets.delete(buckets.keys().next().value);
  return b.count<=LIMIT;
}
export function resetRateLimits(){ buckets.clear(); }
