import { env } from '../config/env.js';
export function applyCors(req,res){
  const origin=req.headers.origin;
  if (!origin) return true;
  if (origin !== env.ALLOWED_ORIGIN) return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Max-Age','600');
  return true;
}
